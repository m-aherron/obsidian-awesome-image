import {Notice, TFile} from "obsidian";
import LocalImagesPlugin from "../main";
import {EXTERNAL_MEDIA_LINK_PATTERN, NOTICE_TIMEOUT, TIMEOUT_LIKE_INFINITY} from "./constants";
import {getLinkFullPath, isLocalImage, replaceAsync} from "./utils";
import {imageTagProcessor} from "./contentProcessor";
import {ImgSettingIto} from "../to/imgTo";

export async function processPage(plugin: LocalImagesPlugin, file: TFile, silent = false) {
    // 保证：处理后图片存到新的地方，不会清理已有图片

    const settings: ImgSettingIto = plugin.settings
    const content = await plugin.app.vault.cachedRead(file);

    const fixedContent = await replaceAsync(
        content,
        EXTERNAL_MEDIA_LINK_PATTERN,
        imageTagProcessor(plugin.app, settings.mediaRootDirectory)
    );

    if (content != fixedContent) {
        await plugin.app.vault.modify(file, fixedContent);

        if (!silent) {
            new Notice(`Page "${file.path}" has been processed, and changed.`);
        }
    } else {
        if (!silent) {
            new Notice(
                `Page "${file.path}" has been processed, but nothing was changed.`
            );
        }
    }
}

export async function findOrphanImages(plugin: LocalImagesPlugin) {
    const orphan = plugin.app.vault.getFiles()
        .map((f) => f.path)
        .filter((f) => {
            return isLocalImage(f)
        })
        .filter((p) => {
            return getLinkFullPath(plugin.app, p) == null;
        })

    const resultText = "----below are orphaned images----\n" + orphan.join("\n") + "\n----end----"
    console.log(resultText);
    navigator.clipboard.writeText(resultText).then(() => {
        new Notice("Orphaned images copied to clipboard");
    });
}

export async function processAllPages(plugin: LocalImagesPlugin) {
    const files = plugin.app.vault.getMarkdownFiles();

    const includeRegex = new RegExp(plugin.settings.includedFileRegex, "i");
    const matchedFiles = files
        .filter(f => f.path.match(includeRegex))
        .filter((f) => {
                for (let folder of plugin.settings.excludedFolders) {
                    if (f.path.startsWith(folder)) {
                        return false;
                    }
                }
                return true;
            }
        )

    const pagesCount = matchedFiles.length;

    const notice = new Notice(
        `Awesome Image \nStart processing. Total ${pagesCount} pages. `,
        TIMEOUT_LIKE_INFINITY
    );

    for (const [index, file] of matchedFiles.entries()) {
        if (notice) {
            notice.setMessage(
                `Awesome Image: Processing \n"${file.path}" \nPage ${index} of ${pagesCount}`
            );
        }
        await processPage(plugin, file, true);
    }
    if (notice) {
        notice.setMessage(`Awesome Image: ${pagesCount} pages were processed.`);

        setTimeout(() => {
            notice.hide();
        }, NOTICE_TIMEOUT);
    }
}