(function () {
    'use strict';

    function injectFolderBrowser() {
        if (!window.modelDownloader) {
            return false;
        }

        const mdl = window.modelDownloader;

        // Check if already injected
        if (mdl._folderBrowserInjected) {
            return true;
        }

        // Check if folder browser elements already exist (from Swarm core or previous injection)
        let folderBrowser = document.getElementById('model_downloader_folder_browser');
        let selectedFolderDisplay = document.getElementById('model_downloader_selected_folder');

        // If they don't exist, we need to create and inject them
        if (!folderBrowser || !selectedFolderDisplay) {
            // Create folder browser elements
            const browserHTML = `
                <br><span style="font-weight: bold;">Destination Folder</span>:
                <span id="model_downloader_selected_folder" class="folder-browser-selected">Root Folder</span>
                <div id="model_downloader_folder_browser" class="folder-browser" style="display: none;"></div>
            `;

            // Insert after the model type dropdown
            const typeDropdown = document.getElementById('model_downloader_type');
            if (!typeDropdown) {
                return false;
            }

            // Find the next sibling to insert after
            let insertAfter = typeDropdown.parentElement;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = browserHTML;

            while (tempDiv.firstChild) {
                if (insertAfter.nextSibling) {
                    insertAfter.parentNode.insertBefore(tempDiv.firstChild, insertAfter.nextSibling);
                } else {
                    insertAfter.parentNode.appendChild(tempDiv.firstChild);
                }
                insertAfter = insertAfter.nextSibling || insertAfter;
            }

            // Get references to the newly created elements
            folderBrowser = document.getElementById('model_downloader_folder_browser');
            selectedFolderDisplay = document.getElementById('model_downloader_selected_folder');
        }

        if (!folderBrowser || !selectedFolderDisplay) {
            return false;
        }

        // Set up references
        mdl.folderBrowser = folderBrowser;
        mdl.selectedFolderDisplay = selectedFolderDisplay;
        mdl.selectedFolder = '(None)';
        mdl.expandedFolders = new Set();
        mdl.folderBrowserVisible = false;

        // Build folder browser
        mdl.buildFolderBrowser = function() {
            if (!window.coreModelMap || !this.folderBrowser) {
                return;
            }

            try {
                const selectedType = this.type.value;
                let folderList = [];
                const submap = window.coreModelMap[selectedType];

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
                html += '<span class="folder-icon">📁</span> <span class="folder-name">Root Folder</span>';
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
                let escapedPath = fullPath.replaceAll('\\', '\\\\').replaceAll("'", "\\'");

                html += '<div class="folder-item-wrapper">';
                html += `<div class="folder-item ${isSelected ? 'selected' : ''}" data-folder="${escapeHtml(fullPath)}">`;

                if (hasChildren) {
                    html += `<span class="folder-toggle" onclick="modelDownloader.toggleFolder('${escapedPath}')">${isExpanded ? '▼' : '▶'}</span>`;
                } else {
                    html += '<span class="folder-toggle-spacer"></span>';
                }

                html += `<span class="folder-icon">📁</span> <span class="folder-name" onclick="modelDownloader.selectFolder('${escapedPath}')">${escapeHtml(folderName)}</span>`;
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
                this.folderBrowser.style.display = 'block';
            } else {
                this.folderBrowser.style.display = 'none';
            }
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
                this.updateSelectedFolderDisplay();
                this.buildFolderBrowser();
            }
        };

        // Wrap reloadFolders to also rebuild browser
        if (mdl.reloadFolders && !mdl.reloadFolders._folderBrowserWrapped) {
            const origReloadFolders = mdl.reloadFolders;
            mdl.reloadFolders = function() {
                origReloadFolders.call(this);
                this.buildFolderBrowser();
            };
            mdl.reloadFolders._folderBrowserWrapped = true;
        }

        // Wrap type change to rebuild folder browser
        if (mdl.type) {
            mdl.type.addEventListener('change', () => {
                mdl.selectedFolder = '(None)';
                mdl.updateSelectedFolderDisplay();
                mdl.buildFolderBrowser();
            });
        }

        // Wrap run() to use selectedFolder
        if (mdl.run && !mdl.run._folderBrowserWrapped) {
            const origRun = mdl.run;
            mdl.run = function() {
                // Store selectedFolder in a temporary variable that Swarm can use
                const folderValue = this.selectedFolder === '(None)' ? '(None)' : this.selectedFolder;

                // Call original with the folder value
                const origFolders = this.folders;
                this.folders = { value: folderValue };
                origRun.call(this);
                this.folders = origFolders;
            };
            mdl.run._folderBrowserWrapped = true;
        }

        // Compatibility: keep folders reference
        mdl.folders = mdl.folderBrowser;

        // Initial build
        mdl.buildFolderBrowser();

        mdl._folderBrowserInjected = true;
        return true;
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(injectFolderBrowser, 100);
            });
        } else {
            setTimeout(injectFolderBrowser, 100);
        }
    }

    init();
})();
