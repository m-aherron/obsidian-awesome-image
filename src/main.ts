import {addIcon, MarkdownView, Notice, Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, ImageToolkitSettingTab,} from './conf/settings'
import {ICONS, VIEW_IMG_SELECTOR} from './conf/constants'
import {MainContainerView} from './ui/mainContainerView';
import {PinContainerView} from './ui/pinContainerView';
import {ImgSettingIto} from "./to/imgTo";
import {ContainerView} from "./ui/containerView";
import path from "path";
import {findOrphanImages, processAllPages, processPage} from "./org/pageProcessor";
import {ensureFolderExists, isLocalImage} from "./org/utils";
import {OB_PASTED_IMAGE_PREFIX} from "./org/constants";
import {getNewFileName} from "./org/contentProcessor";

export default class ImageToolkitPlugin extends Plugin {

    public settings: ImgSettingIto;
    public containerView: ContainerView;
    public imgSelector: string = ``;

    async onload() {
        console.log('loading ' + this.manifest.id + ' plugin v' + this.manifest.version + ' ...');

        await this.loadSettings();


        this.addCommand({
            id: "process-images-active",
            name: "Process images for active file",
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                await processPage(this, activeFile);
            },
        });

        this.addCommand({
            id: "process-images-all",
            name: "Process images for all your notes",
            callback: async () => {
                await processAllPages(this);
            },
        });

        this.addCommand({
            id: "list-orphan-images",
            name: "List images that are not linked by your notes",
            callback: async () => {
                await findOrphanImages(this);
            },
        });

        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                    if (!this.settings.realTimeUpdate)
                        return;
                    if (!(file instanceof TFile))
                        return;
                    // if the pasted image is created more than 1 second ago, ignore it
                    const timeGapMs = (new Date().getTime()) - file.stat.ctime
                    if (timeGapMs > 1000)
                        return;
                    // only monitor image file creation
                    if (!isLocalImage(file.name) || !file.name.startsWith(OB_PASTED_IMAGE_PREFIX))
                        return;

                    const oldFileName = file.path
                    const fileData = await this.app.vault.adapter.readBinary(file.path);
                    const {newFileName, isDuplicated} = await getNewFileName(
                        this.app,
                        this.settings.mediaRootDirectory,
                        fileData
                    )
                    if (isDuplicated) {
                        const warn_txt = `IMAGE Duplicated! OPEN CONSOLE! FROM |${file.path}| TO |${newFileName}|, please edit manually`
                        new Notice(warn_txt)
                        console.warn(warn_txt);
                        return
                    }
                    const activeFile = this.app.workspace.getActiveFile();
                    // get origin file link before renaming
                    const linkText = this.app.fileManager.generateMarkdownLink(file, activeFile.path);

                    await ensureFolderExists(this.app, path.dirname(newFileName));
                    await this.app.fileManager.renameFile(file, newFileName);  // this will not change active file content

                    const newLinkText = this.app.fileManager.generateMarkdownLink(file, activeFile.path);

                    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
                    if (!view || view.file.path != activeFile.path) {
                        new Notice(`Failed to rename ${newFileName}: no active editor`)
                        return
                    }

                    const editor = view.editor
                    const cursor = editor.getCursor()
                    const line = editor.getLine(cursor.line)
                    console.log('current line: ', line)
                    editor.transaction({
                        changes: [
                            {
                                from: {...cursor, ch: 0},
                                to: {...cursor, ch: line.length},
                                text: line.replace(linkText, newLinkText),
                            }
                        ]
                    })
                    new Notice(`Renamed ${oldFileName} to ${newFileName}`)
                }
            )
        )

        // plugin settings
        this.addSettingTab(new ImageToolkitSettingTab(this.app, this));

        // this.registerCommands();

        this.initContainerView(this.settings.pinMode);

        this.toggleViewImage();
    }

    onunload() {
        console.log('unloading obsidian-image-toolkit plugin...');
        this.containerView.removeOitContainerView();
        this.containerView = null;
        document.off('click', this.imgSelector, this.clickImage);
        document.off('mouseover', this.imgSelector, this.mouseoverImg);
        document.off('mouseout', this.imgSelector, this.mouseoutImg);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.addIcons();
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async registerCommands() {
        /* this.addCommand({
            "id": "oit-move-up-image",
            "name": "move up the image",
            hotkeys: [{ modifiers: ["Ctrl"], key: "ArrowUp" }],
            checkCallback: (checking: boolean) => {
                if (checking) return false;
                this.containerView.moveImgViewByHotkey('UP');
            },
        }); */
    }

    private addIcons = () => {
        for (const icon of ICONS) {
            addIcon(icon.id, icon.svg);
        }
    }

    private initContainerView = (pinMode: boolean) => {
        this.containerView = pinMode ?
            new PinContainerView(this, "PIN") :
            new MainContainerView(this, "MAIN");
    }

    public togglePinMode = (pinMode: boolean) => {
        this.containerView.removeOitContainerView();
        this.initContainerView(pinMode);
    }

    private clickImage = (event: MouseEvent) => {
        const targetEl = (<HTMLImageElement>event.target);
        if (!targetEl || 'IMG' !== targetEl.tagName
            || !this.containerView.checkHotkeySettings(event, this.settings.viewTriggerHotkey))
            return;
        this.containerView.renderContainerView(targetEl);
    }

    private mouseoverImg = (event: MouseEvent) => {
        const targetEl = (<HTMLImageElement>event.target);
        if (!targetEl || 'IMG' !== targetEl.tagName)
            return;
        // console.log('mouseoverImg......');
        const defaultCursor = targetEl.getAttribute('data-oit-default-cursor');
        if (null === defaultCursor) {
            targetEl.setAttribute('data-oit-default-cursor', targetEl.style.cursor || '');
        }
        targetEl.style.cursor = 'zoom-in';
    }

    private mouseoutImg = (event: MouseEvent) => {
        const targetEl = (<HTMLImageElement>event.target);
        // console.log('mouseoutImg....');
        if (!targetEl || 'IMG' !== targetEl.tagName) return;
        targetEl.style.cursor = targetEl.getAttribute('data-oit-default-cursor');
    }

    public toggleViewImage = () => {
        const viewImageEditor = this.settings.viewImageEditor; // .workspace-leaf-content[data-type='markdown'] img,.workspace-leaf-content[data-type='image'] img
        const viewImageInCPB = this.settings.viewImageInCPB; // .community-plugin-readme img
        const viewImageWithALink = this.settings.viewImageWithALink; // false: ... img:not(a img)
        const viewImageOther = this.settings.viewImageOther; // #sr-flashcard-view img

        if (this.imgSelector) {
            document.off('click', this.imgSelector, this.clickImage);
            document.off('mouseover', this.imgSelector, this.mouseoverImg);
            document.off('mouseout', this.imgSelector, this.mouseoutImg);
        }
        if (!viewImageOther && !viewImageEditor && !viewImageInCPB && !viewImageWithALink) {
            return;
        }
        let selector = ``;
        if (viewImageEditor) {
            selector += (viewImageWithALink ? VIEW_IMG_SELECTOR.EDITOR_AREAS : VIEW_IMG_SELECTOR.EDITOR_AREAS_NO_LINK);
        }
        if (viewImageInCPB) {
            selector += (1 < selector.length ? `,` : ``) + (viewImageWithALink ? VIEW_IMG_SELECTOR.CPB : VIEW_IMG_SELECTOR.CPB_NO_LINK);
        }
        if (viewImageOther) {
            selector += (1 < selector.length ? `,` : ``) + (viewImageWithALink ? VIEW_IMG_SELECTOR.OTHER : VIEW_IMG_SELECTOR.OTHER_NO_LINK);
        }

        if (selector) {
            // console.log('selector: ', selector);
            this.imgSelector = selector;
            document.on('click', this.imgSelector, this.clickImage);
            document.on('mouseover', this.imgSelector, this.mouseoverImg);
            document.on('mouseout', this.imgSelector, this.mouseoutImg);
        }
    }
}
