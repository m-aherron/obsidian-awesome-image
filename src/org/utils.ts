import {fileTypeFromBuffer} from "file-type";
import isSvg from "is-svg";
import {App} from "obsidian";
import {FORBIDDEN_SYMBOLS_FILENAME_PATTERN, IMAGE_EXTS_LOWER} from "./constants";
import path from "path";
import got from "got";
import filenamify from "filenamify";
import sha256 from "crypto-js/sha256";
import CryptoJS from "crypto-js/core";

export async function replaceAsync(str: any, regex: any, asyncFn: any) {
    /*
    https://stackoverflow.com/a/48032528/1020973
    It will be better to do it type-correct.
    */
    const promises: Promise<any>[] = [];
    str.replace(regex, (match: string, ...args: any) => {
        const promise = asyncFn(match, ...args);
        promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
}

export function isUrl(link: string) {
    if (link.startsWith('data:image')) {
        return false;
    }
    try {
        return Boolean(new URL(link));
    } catch (_) {
        return false;
    }
}

export function isLocalImage(filePath: string) {
    if (isUrl(filePath)) {
        return false;
    }

    for (let ext of IMAGE_EXTS_LOWER) {
        if (filePath.toLowerCase().endsWith("." + ext))
            return true;
    }
    return false;
}

export async function downloadImage(url: string): Promise<ArrayBuffer> {
    const res = await got(url, {responseType: "buffer"});
    return res.body;
}

export async function fileExtByContent(content: ArrayBuffer) {
    const fileExt = (await fileTypeFromBuffer(content))?.ext;

    // if XML, probably it is SVG
    if (fileExt == "xml") {
        const buffer = Buffer.from(content);
        if (isSvg(buffer)) return "svg";
    }
    return fileExt;
}

export function cleanFileName(name: string) {
    return filenamify(name).replace(
        FORBIDDEN_SYMBOLS_FILENAME_PATTERN,
        "_"
    );
}

export function pathJoin(dir: string, subpath: string): string {
    const result = path.join(dir, subpath);
    // it seems that obsidian do not understand paths with backslashes in Windows, so turn them into forward slashes
    return result.replace(/\\/g, "/");
}

export async function ensureFolderExists(app: App, folderPath: string) {
    try {
        await app.vault.createFolder(folderPath);
    } catch (error) {
        if (!error.message.contains("Folder already exists")) {
            throw error;
        }
    }
}

export function genSha256(data: ArrayBuffer) {
    return sha256(arrayBufferToWordArray(data)).toString().toLowerCase()
}

export function arrayBufferToWordArray(ab: ArrayBuffer) {
    const i8a = new Uint8Array(ab);
    const a = [];
    for (let i = 0; i < i8a.length; i += 4) {
        a.push(i8a[i] << 24 | i8a[i + 1] << 16 | i8a[i + 2] << 8 | i8a[i + 3]);
    }
    return CryptoJS.lib.WordArray.create(a, i8a.length);
}

export function getLinkFullPath(app: App, link: string) {
    const resolvedLinks = app.metadataCache.resolvedLinks
    for (const noteFullPath in resolvedLinks) {
        for (const linkFullPath in resolvedLinks[noteFullPath]) {
            if (path.basename(linkFullPath) === path.basename(link) && linkFullPath.contains(link)) {
                return linkFullPath
            }
        }
    }
    return null;
}

export function arraybufferEqual(buf1: ArrayBuffer | null, buf2: ArrayBuffer | null) {
    if (buf1.byteLength != buf2.byteLength) return false;
    const dv1 = new Int8Array(buf1);
    const dv2 = new Int8Array(buf2);
    for (let i = 0; i != buf1.byteLength; i++) {
        if (dv1[i] != dv2[i]) return false;
    }
    return true;
}
