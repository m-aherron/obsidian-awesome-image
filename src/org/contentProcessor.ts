import {App} from "obsidian";
import {
    arraybufferEqual,
    cleanFileName,
    downloadImage,
    ensureFolderExists,
    fileExtByContent,
    genSha256,
    getLinkFullPath,
    isLocalImage,
    isUrl,
    pathJoin
} from "./utils";
import path from "path";


export function imageTagProcessor(app: App, mediaDir: string) {
    async function processUrlImageTag(match: string, anchor: string, link: string) {
        // 可以接收到本地文件的link，需要判断是否是图片
        // 如遇到重复的图片，只改链接。  后面再开发个功能，处理遗留的孤儿图片
        // 链接不是图片，报警并继续运行即可

        if (!isUrl(link) && !isLocalImage(link)) {
            return match;
        }

        try {
            let fileData = null;

            if (isLocalImage(link)) {
                let oldFileFullPath = getLinkFullPath(app, decodeURI(link))
                if (!oldFileFullPath) {
                    return match;
                }
                fileData = await app.vault.adapter.readBinary(oldFileFullPath);
            } else {
                fileData = await downloadImage(link);
            }

            const {newFileName, isDuplicated} = await getNewFileName(
                app,
                mediaDir,
                fileData
            )

            if (!isDuplicated) {
                await ensureFolderExists(app, path.dirname(newFileName));
                await app.vault.createBinary(newFileName, fileData);
            }
            if (!newFileName) {
                return match;
            }
            const newMatch = `![${anchor}](${newFileName})`
            if (match == newMatch) {
                return match;
            }
            console.log(`Awesome Image changed link: FROM |${link}| TO |${newFileName}|`)
            return newMatch;
        } catch (error) {
            console.warn("Image processing failed for link: " + link, error);
            return match;
        }
    }

    return processUrlImageTag;
}

export async function getNewFileName(
    app: App,
    dir: string,
    contentData: ArrayBuffer
): Promise<{ newFileName: string; isDuplicated: boolean }> {
    let isDuplicated = false

    const fileExt = await fileExtByContent(contentData);
    const baseName = cleanFileName(genSha256(contentData));

    dir = pathJoin(dir, baseName.slice(0, 1) + '/' + baseName.slice(1, 2) + '/' + baseName.slice(2, 3))
    const suggestedName = pathJoin(dir, `${baseName}.${fileExt}`)

    if (await app.vault.adapter.exists(suggestedName, false)) {
        const targetFileData = await app.vault.adapter.readBinary(suggestedName);
        if (arraybufferEqual(contentData, targetFileData)) {
            isDuplicated = true;
        } else {
            const errMsg = "SHA256 collision happened for file: " + suggestedName
            console.warn(errMsg);
            throw new Error(errMsg);
        }
    }

    return {newFileName: suggestedName, isDuplicated};
}
