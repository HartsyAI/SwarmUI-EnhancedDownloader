(function () {
    'use strict';

    function hideOldFolderRow(oldFolderDropdown) {
        oldFolderDropdown.style.display = 'none';
        const popover = document.getElementById('popover_modeldownloaderfolder');
        if (popover) {
            popover.style.display = 'none';
        }
        let node = oldFolderDropdown.previousSibling;
        while (node) {
            const prev = node.previousSibling;
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.trim() === ':' || node.textContent.includes('Folder')) {
                    node.textContent = '';
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'B' && node.textContent.trim() === 'Folder') {
                    node.style.display = 'none';
                } else if (node.classList && node.classList.contains('auto-input-qbutton')) {
                    node.style.display = 'none';
                } else if (node.tagName === 'BR') {
                    node.style.display = 'none';
                    break;
                }
            }
            node = prev;
        }
        if (oldFolderDropdown.nextElementSibling && oldFolderDropdown.nextElementSibling.classList.contains('enhanced-downloader-new-folder')) {
            oldFolderDropdown.nextElementSibling.style.display = 'none';
        }
    }

    function syncHiddenDropdown(folderPath) {
        const oldDropdown = document.getElementById('model_downloader_folder');
        if (!oldDropdown) {
            return;
        }
        if (folderPath !== '(None)' && ![...oldDropdown.options].some(o => o.value === folderPath)) {
            const opt = document.createElement('option');
            opt.value = folderPath;
            opt.textContent = folderPath;
            oldDropdown.appendChild(opt);
        }
        oldDropdown.value = folderPath;
        oldDropdown.dispatchEvent(new Event('change'));
    }

    function injectFolderBrowser() {
        if (!window.modelDownloader) {
            return false;
        }

        const mdl = window.modelDownloader;

        if (mdl._folderBrowserInjected) {
            return true;
        }

        const oldFolderDropdown = document.getElementById('model_downloader_folder');
        if (oldFolderDropdown) {
            hideOldFolderRow(oldFolderDropdown);
        }

        let folderBrowser = document.getElementById('model_downloader_folder_browser');
        let selectedFolderDisplay = document.getElementById('model_downloader_selected_folder');

        if (!folderBrowser || !selectedFolderDisplay) {
            if (!oldFolderDropdown) {
                return false;
            }

            const browserHTML = `<br><span style="font-weight: bold;">Destination Folder</span>: ` +
                `<span id="model_downloader_selected_folder" class="folder-browser-selected">Root Folder</span>` +
                `<div id="model_downloader_folder_browser" class="folder-browser" style="display: none;"></div>`;

            oldFolderDropdown.insertAdjacentHTML('afterend', browserHTML);

            folderBrowser = document.getElementById('model_downloader_folder_browser');
            selectedFolderDisplay = document.getElementById('model_downloader_selected_folder');
        }

        if (!folderBrowser || !selectedFolderDisplay) {
            return false;
        }

        mdl.folderBrowser = folderBrowser;
        mdl.selectedFolderDisplay = selectedFolderDisplay;
        mdl.selectedFolder = '(None)';
        mdl.expandedFolders = new Set();
        mdl.folderBrowserVisible = false;

        selectedFolderDisplay.addEventListener('click', () => mdl.toggleFolderBrowser());

        mdl.buildFolderBrowser = function() {
            if (!this.folderBrowser) {
                return;
            }

            try {
                const selectedType = this.type.value;
                let folderList = [];
                const submap = coreModelMap ? coreModelMap[selectedType] : null;

                if (submap) {
                    for (let model of submap) {
                        let parts = model.split('/');
                        if (parts.length == 1) {
                            continue;
                        }
                        for (let i = 1; i < parts.length; i++) {
                            let folder = parts.slice(0, i).join('/');
                            if (!folderList.includes(folder)) {
                                folderList.push(folder);
                            }
                        }
                    }
                }
                folderList.sort();

                let tree = {};
                for (let folder of folderList) {
                    let parts = folder.split('/');
                    let current = tree;
                    for (let i = 0; i < parts.length; i++) {
                        if (!current[parts[i]]) {
                            current[parts[i]] = {};
                        }
                        current = current[parts[i]];
                    }
                }

                let html = '<div class="folder-browser-header">';
                html += `<div class="folder-item ${this.selectedFolder === '(None)' ? 'selected' : ''}" onclick="modelDownloader.selectFolder('(None)')">`;
                html += '<span class="folder-icon">\uD83D\uDCC1</span> <span class="folder-name">Root Folder</span>';
                html += '</div>';
                html += '<button class="folder-new-btn" onclick="modelDownloader.createNewFolder()">+ New Folder</button>';
                html += '</div>';
                html += '<div class="folder-tree">';
                html += this.renderFolderTree(tree, '');
                html += '</div>';

                this.folderBrowser.innerHTML = html;
            } catch (e) {
                console.error('Error building folder browser:', e);
            }
        };

        mdl.renderFolderTree = function(tree, prefix) {
            let html = '';
            for (let folderName in tree) {
                let fullPath = prefix ? `${prefix}/${folderName}` : folderName;
                let hasChildren = Object.keys(tree[folderName]).length > 0;
                let isExpanded = this.expandedFolders.has(fullPath);
                let isSelected = this.selectedFolder === fullPath;
                let escapedPath = escapeJsString(fullPath);

                html += '<div class="folder-item-wrapper">';
                html += `<div class="folder-item ${isSelected ? 'selected' : ''}" data-folder="${escapeHtml(fullPath)}">`;

                if (hasChildren) {
                    html += `<span class="folder-toggle" onclick="modelDownloader.toggleFolder('${escapedPath}')">${isExpanded ? '\u25BC' : '\u25B6'}</span>`;
                } else {
                    html += '<span class="folder-toggle-spacer"></span>';
                }

                html += `<span class="folder-icon">\uD83D\uDCC1</span> <span class="folder-name" onclick="modelDownloader.selectFolder('${escapedPath}')">${escapeHtml(folderName)}</span>`;
                html += '</div>';

                if (hasChildren && isExpanded) {
                    html += '<div class="folder-children">';
                    html += this.renderFolderTree(tree[folderName], fullPath);
                    html += '</div>';
                }

                html += '</div>';
            }
            return html;
        };

        mdl.toggleFolderBrowser = function() {
            this.folderBrowserVisible = !this.folderBrowserVisible;
            if (this.folderBrowserVisible) {
                this.buildFolderBrowser();
            }
            this.folderBrowser.style.display = this.folderBrowserVisible ? 'block' : 'none';
        };

        mdl.updateSelectedFolderDisplay = function() {
            let displayText = this.selectedFolder === '(None)' ? 'Root Folder' : this.selectedFolder;
            this.selectedFolderDisplay.innerText = displayText;
        };

        mdl.toggleFolder = function(folderPath) {
            if (this.expandedFolders.has(folderPath)) {
                this.expandedFolders.delete(folderPath);
            } else {
                this.expandedFolders.add(folderPath);
            }
            this.buildFolderBrowser();
        };

        mdl.selectFolder = function(folderPath) {
            this.selectedFolder = folderPath;
            syncHiddenDropdown(folderPath);
            this.updateSelectedFolderDisplay();
            this.toggleFolderBrowser();
        };

        mdl.createNewFolder = function() {
            let folderName = prompt('Enter new folder name (use "/" for nested folders):');
            if (!folderName) {
                return;
            }
            folderName = folderName.trim().replaceAll('\\', '/');
            while (folderName.includes('//')) {
                folderName = folderName.replaceAll('//', '/');
            }
            if (folderName.startsWith('/')) {
                folderName = folderName.substring(1);
            }
            if (folderName.endsWith('/')) {
                folderName = folderName.substring(0, folderName.length - 1);
            }
            if (folderName) {
                this.selectedFolder = folderName;
                let parts = folderName.split('/');
                for (let i = 1; i < parts.length; i++) {
                    this.expandedFolders.add(parts.slice(0, i).join('/'));
                }
                syncHiddenDropdown(folderName);
                this.updateSelectedFolderDisplay();
                this.buildFolderBrowser();
            }
        };

        if (mdl.reloadFolders && !mdl.reloadFolders._folderBrowserWrapped) {
            const origReloadFolders = mdl.reloadFolders;
            mdl.reloadFolders = function() {
                origReloadFolders.call(this);
                this.buildFolderBrowser();
            };
            mdl.reloadFolders._folderBrowserWrapped = true;
        }

        if (mdl.type) {
            mdl.type.addEventListener('change', () => {
                mdl.selectedFolder = '(None)';
                syncHiddenDropdown('(None)');
                mdl.updateSelectedFolderDisplay();
                mdl.buildFolderBrowser();
            });
        }

        if (mdl.run && !mdl.run._folderBrowserWrapped) {
            const origRun = mdl.run;
            mdl.run = function() {
                syncHiddenDropdown(this.selectedFolder);
                origRun.call(this);
            };
            mdl.run._folderBrowserWrapped = true;
        }

        mdl.buildFolderBrowser();

        mdl._folderBrowserInjected = true;
        return true;
    }

    injectFolderBrowser();
})();
