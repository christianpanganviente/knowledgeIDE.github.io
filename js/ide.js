tailwind.config = {
    theme: {
        extend: {
            colors: {
                'blackish': '#0a0a0a',
                'primary': '#FFC700',
                'primary-hover': '#FDB813',
                'secondary': '#61dafb',
                'code-bg': '#1e1e1e',
                'sidebar-bg': '#161616',
                'panel-bg': '#1b1b1b',
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        }
    }
}

let editor;
const functionTimers = {};
let autoRunTimeout;
let splitEditor = null;
let lastActivityBarClick = { view: null, time: 0 };
let lastLog = { message: null, type: null, element: null, count: 1 };

require.config({
    paths: {
        'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs',
        'jszip': 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min'
    }
});

const safeStringify = (obj) => {
    let cache = new Set();
    const result = JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (cache.has(value)) {
                return '[Circular]';
            }
            cache.add(value);
        }
        return value;
    }, 2);
    cache.clear();
    return result;
};

require(['vs/editor/editor.main', 'jszip'], function(_, JSZip) {
    let state = {
        fileTree: [
            { id: 'folder-1', name: 'src', type: 'folder', children: [
                { id: '1', name: 'script.js', type: 'file', language: 'javascript', content: `// Welcome to Knowledge IDE! 🚀\nconsole.log("Hello, World!");\nconsole.log("Hello, World!");\nconsole.warn("This is a warning.");\nconsole.error({ message: "An error object!" });\ndocument.body.querySelector('h1').style.color = 'orange';` },
                { id: '2', name: 'index.html', type: 'file', language: 'html', content: `<!DOCTYPE html>\n<html>\n  <head>\n    <link rel="stylesheet" href="style.css">\n    <title>My App</title>\n  </head>\n  <body>\n    <h1>Hello from HTML!</h1>\n    <script src="script.js"></script>\n  </body>\n</html>` },
                { id: '3', name: 'style.css', type: 'file', language: 'css', content: `body {\n background-color: #f0f0f0;\n font-family: sans-serif;\n color: #333;\n}` },
            ], isOpen: true },
        ],
        openFiles: [],
        activeFileId: null,
        selectedItemId: null,
        renamingItemId: null,
        settings: {
            autoRun: false,
            bottomPanelHeight: '200px',
            activeSidebarView: 'explorer'
        }
    };

    const elements = {
        fileExplorerContainer: document.getElementById('file-explorer-container'),
        tabBar: document.getElementById('tab-bar'),
        editorContainer: document.getElementById('editor-container'),
        welcomeScreen: document.getElementById('welcome-screen'),
        consolePanel: document.getElementById('console-panel'),
        previewIframe: document.getElementById('preview-iframe'),
        sidebar: document.getElementById('sidebar-panel'),
        sidebarToggle: document.getElementById('sidebar-toggle-mobile'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        runButton: document.getElementById('run-button'),
        headerRunBtn: document.getElementById('header-run-btn'),
        headerSaveBtn: document.getElementById('header-save-btn'),
        menuNewFile: document.getElementById('menu-new-file'),
        menuNewFolder: document.getElementById('menu-new-folder'),
        newFileBtn: document.getElementById('new-file-btn'),
        newFolderBtn: document.getElementById('new-folder-btn'),
        themeSelector: document.getElementById('theme-selector'),
        cursorPosition: document.getElementById('cursor-position'),
        languageStatus: document.getElementById('language-status'),
        autoRunCheckbox: document.getElementById('auto-run-checkbox'),
        saveNotification: document.getElementById('save-notification'),
        searchInput: document.getElementById('search-input'),
        searchResults: document.getElementById('search-results'),
        editorPanelWrapper: document.getElementById('editor-panel-wrapper'),
        resizeHandleY: document.getElementById('resize-handle-y'),
        editorArea: document.getElementById('editor-area'),
        bottomPanelArea: document.getElementById('bottom-panel-area'),
        activityBarButtons: document.querySelectorAll('.activity-bar button'),
        sidebarViews: document.querySelectorAll('.sidebar-view'),
        mobileViewTabs: document.getElementById('mobile-view-tabs'),
        editorPage: document.getElementById('editor-area'),
        consolePage: document.getElementById('console-panel'),
        previewPage: document.getElementById('preview-panel'),
    };

    function saveState(showNotification = false) {
        try {
            if(state.activeFileId && editor) updateFileContentFromEditor();
            if (window.innerWidth >= 1024) {
                 state.settings.bottomPanelHeight = elements.bottomPanelArea.style.height;
            }
            localStorage.setItem('knowledge-ide-state', JSON.stringify(state));

            if (showNotification) {
                elements.saveNotification.textContent = "Saved to Local!";
                elements.saveNotification.classList.remove('opacity-0');
                setTimeout(() => elements.saveNotification.classList.add('opacity-0'), 2000);
            }
        } catch (e) {
            console.error("Failed to save state:", e);
        }
    }

    function loadState() {
        try {
            const savedState = localStorage.getItem('knowledge-ide-state');
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                parsedState.settings = { ...state.settings, ...parsedState.settings };
                state = parsedState;
            }
            elements.autoRunCheckbox.checked = state.settings.autoRun;
        } catch (e) {
            console.error("Failed to load state:", e);
        }
    }

    const findItem = (itemId, tree = state.fileTree) => {
        for (const item of tree) {
            if (item.id === itemId) return {item, parent: tree};
            if (item.type === 'folder') {
                const found = findItem(itemId, item.children);
                if (found) return found;
            }
        }
        return null;
    };

    const getIconForFile = (name) => {
        if (name.endsWith('.js')) return 'fab fa-js-square text-yellow-400';
        if (name.endsWith('.html')) return 'fab fa-html5 text-red-500';
        if (name.endsWith('.css')) return 'fab fa-css3-alt text-blue-500';
        return 'fas fa-file text-gray-400';
    };

    const getLanguageForFile = (name) => {
        if (name.endsWith('.js')) return 'javascript';
        if (name.endsWith('.html')) return 'html';
        if (name.endsWith('.css')) return 'css';
        return 'plaintext';
    };

    const generateUniqueName = (baseName, parent) => {
        let newName = baseName;
        let counter = 1;
        const parts = baseName.split('.');
        const extension = parts.length > 1 ? '.' + parts.pop() : '';
        const nameWithoutExt = parts.join('.');

        while (parent.some(item => item.name === newName)) {
            newName = `${nameWithoutExt}(${counter})${extension}`;
            counter++;
        }
        return newName;
    };

    const renderFileExplorer = () => {
        const renderNode = (node, level) => {
            const indent = level * 16;
            const isSelected = state.selectedItemId === node.id ? 'selected' : '';
            const isRenaming = state.renamingItemId === node.id;

            const nameContent = isRenaming ?
                `<input type="text" class="rename-input" value="${node.name}" data-id="${node.id}" />` :
                `<span class="item-name">${node.name}</span>`;

            const folderIcon = node.isOpen ? 'fa-folder-open' : 'fa-folder';

            if (node.type === 'folder') {
                const isCollapsed = node.isOpen === false ? 'collapsed' : '';
                return `
                    <div class="folder-item file-explorer-item ${isSelected} ${isCollapsed}" data-id="${node.id}" style="padding-left: ${indent}px;">
                        <div class="flex items-center justify-between py-1 cursor-pointer">
                            <span>
                                <i class="folder-toggle-icon fas fa-chevron-right w-3 ${node.isOpen ? 'rotate-90' : ''}"></i>
                                <i class="fas ${folderIcon} text-primary mr-1 ml-1"></i>
                                ${nameContent}
                            </span>
                            <button class="delete-item-btn text-gray-600 hover:text-red-500 hidden" data-id="${node.id}" title="Delete"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                    <div class="folder-content ${isCollapsed ? 'hidden' : ''}">
                        ${node.children.map(child => renderNode(child, level + 1)).join('')}
                    </div>
                `;
            } else {
                return `
                    <div class="file-item file-explorer-item ${isSelected}" data-id="${node.id}" style="padding-left: ${indent + 16}px;">
                        <div class="flex items-center justify-between py-1 cursor-pointer">
                            <span>
                                <i class="${getIconForFile(node.name)} mr-2"></i>
                                ${nameContent}
                            </span>
                            <button class="delete-item-btn text-gray-600 hover:text-red-500 hidden" data-id="${node.id}" title="Delete"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                `;
            }
        };
        elements.fileExplorerContainer.innerHTML = state.fileTree.map(node => renderNode(node, 0)).join('');
        const renameInput = elements.fileExplorerContainer.querySelector('.rename-input');
        if (renameInput) { renameInput.focus(); renameInput.select(); }
    };

    const renderTabs = () => {
        elements.tabBar.innerHTML = state.openFiles.map(fileId => {
            const result = findItem(fileId);
            if (!result) return '';
            const file = result.item;
            return `<div class="tab h-full flex items-center px-4 text-sm cursor-pointer ${state.activeFileId === fileId ? 'active-tab' : 'text-gray-400 hover:bg-[#252525]'}" data-id="${file.id}">
                        <i class="${getIconForFile(file.name)} mr-2"></i>
                        ${file.name}
                        <i class="close-tab-btn fas fa-times ml-3 text-gray-500 hover:text-white" data-id="${file.id}"></i>
                    </div>`;
        }).join('');
    };

    const updateEditor = () => {
        if (state.activeFileId) {
            const result = findItem(state.activeFileId);
            if (!result) {
                state.activeFileId = null;
                updateEditor();
                return;
            }
            const file = result.item;

            elements.welcomeScreen.style.display = 'none';
            elements.editorContainer.style.display = 'block';

            if (editor.getModel()?.id !== file.id || editor.getModel()?.getLanguageId() !== file.language) {
                let model = monaco.editor.getModel(monaco.Uri.parse(file.id));
                if (!model) {
                    model = monaco.editor.createModel(file.content, file.language, monaco.Uri.parse(file.id));
                    model.onDidChangeContent(() => {
                        if (state.settings.autoRun) {
                            clearTimeout(autoRunTimeout);
                            autoRunTimeout = setTimeout(runCode, 500);
                        }
                    });
                }
                editor.setModel(model);

                if (editor.getModel().getLanguageId() !== file.language) {
                    monaco.editor.setModelLanguage(editor.getModel(), file.language);
                }
            }

            elements.languageStatus.textContent = file.language.charAt(0).toUpperCase() + file.language.slice(1);
        } else {
            elements.welcomeScreen.style.display = 'flex';
            elements.editorContainer.style.display = 'none';
            elements.languageStatus.textContent = 'Plain Text';
            elements.cursorPosition.textContent = 'Ln 1, Col 1';
            editor.setModel(null);
        }
    };

    const updateUI = () => {
        renderFileExplorer();
        renderTabs();
        updateEditor();
        saveState();
        if (editor) editor.layout();
    };

    const updateFileContentFromEditor = () => {
        if (state.activeFileId && editor.getModel()) {
            const result = findItem(state.activeFileId);
            if (result) result.item.content = editor.getModel().getValue();
        }
    };

    const openFile = (fileId) => {
        if (!state.openFiles.includes(fileId)) state.openFiles.push(fileId);
        setActiveFile(fileId);
        if (window.innerWidth < 1024) toggleSidebar(false);
    };

    const setActiveFile = (fileId) => {
        updateFileContentFromEditor();
        state.activeFileId = fileId;
        state.selectedItemId = fileId;
        state.renamingItemId = null;
        updateUI();
    };

    const closeFile = (fileId) => {
        state.openFiles = state.openFiles.filter(id => id !== fileId);
        const model = monaco.editor.getModel(monaco.Uri.parse(fileId));
        if (model) model.dispose();

        if (state.activeFileId === fileId) {
            state.activeFileId = state.openFiles[state.openFiles.length - 1] || null;
        }
        updateUI();
    };

    const createNewItem = (type) => {
        const baseName = type === 'file' ? 'untitled.js' : 'NewFolder';
        let parentList = state.fileTree;

        const selected = state.selectedItemId ? findItem(state.selectedItemId) : null;
        if (selected) {
            if (selected.item.type === 'folder') {
                parentList = selected.item.children;
                selected.item.isOpen = true;
            } else {
                parentList = selected.parent;
            }
        }

        const name = generateUniqueName(baseName, parentList);
        const newItem = { id: Date.now().toString(), name, type };
        if (type === 'file') {
            newItem.language = getLanguageForFile(name);
            newItem.content = `// ${name} created on ${new Date().toLocaleTimeString()}`;
        } else {
            newItem.children = [];
            newItem.isOpen = true;
        }

        parentList.push(newItem);
        state.selectedItemId = newItem.id;
        if (type === 'file') openFile(newItem.id);
        else updateUI();
    };

    const deleteItem = (itemId) => {
        const found = findItem(itemId);
        if (!found) return;
        const { item, parent } = found;

        const deleteRecursively = (folder) => {
            folder.children.forEach(child => {
                if (child.type === 'file') closeFile(child.id);
                else deleteRecursively(child);
            });
        }

        if (item.type === 'folder') deleteRecursively(item);
        else closeFile(item.id);

        const index = parent.findIndex(i => i.id === itemId);
        if (index > -1) parent.splice(index, 1);

        if (state.selectedItemId === itemId) {
            state.selectedItemId = null;
        }

        updateUI();
    };

    const handleRename = (itemId, newName) => {
        console.log("HI")
        const found = findItem(itemId);
        if (!found) {
            state.renamingItemId = null;
            updateUI();
            return;
        }
        const { item, parent } = found;

        if (!newName || newName === item.name) {
            state.renamingItemId = null;
            updateUI();
            return;
        }

        if (parent.some(i => i.name === newName && i.id !== itemId)) {
            state.renamingItemId = null;
            updateUI();
            return;
        }

        item.name = newName;

        if (item.type === 'file') {
            item.language = getLanguageForFile(newName);
            if (state.activeFileId === itemId) {
                updateEditor();
            }
        }

        if (state.openFiles.includes(itemId)) {
            renderTabs();
        }

        state.renamingItemId = null;
        updateUI();
    };

    const logToConsole = (type, message) => {
        if (message === lastLog.message && type === lastLog.type && lastLog.element) {
            lastLog.count++;
            let countEl = lastLog.element.querySelector('.log-count');
            if (!countEl) {
                countEl = document.createElement('span');
                countEl.className = 'log-count text-gray-400 font-bold mr-2 w-8 text-right flex-shrink-0';
                lastLog.element.prepend(countEl);
            }
            countEl.textContent = `(x${lastLog.count})`;
            elements.consolePanel.scrollTop = elements.consolePanel.scrollHeight;
            return;
        }

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry p-1 border-b border-panel-bg text-sm font-mono whitespace-pre-wrap flex items-start';

        let iconClass = '';
        let textClass = 'text-gray-200';

        switch (type) {
            case 'log': iconClass = 'text-gray-400 fas fa-info-circle'; break;
            case 'warn': iconClass = 'text-yellow-500 fas fa-exclamation-triangle'; textClass = 'text-yellow-300'; break;
            case 'error': iconClass = 'text-red-500 fas fa-times-circle'; textClass = 'text-red-400'; break;
            default: iconClass = 'text-gray-400 fas fa-info-circle';
        }

        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        logEntry.innerHTML = `
            <span class="log-count w-8 mr-2 flex-shrink-0"></span>
            <span class="timestamp text-gray-500 w-20 flex-shrink-0">${timestamp}</span>
            <span class="log-content flex-grow flex items-start">
                <span class="mr-2 ${iconClass}"></span>
                <span class="${textClass}">${message}</span>
            </span>
        `;
        
        elements.consolePanel.appendChild(logEntry);
        elements.consolePanel.scrollTop = elements.consolePanel.scrollHeight;

        lastLog = { message, type, element: logEntry, count: 1 };
    };

    const clearConsole = () => {
        elements.consolePanel.innerHTML = '<div class="text-gray-500 italic mb-1">Execution Profiling is active. Run code with the <span class="text-primary font-semibold">Run</span> button.</div>';
        lastLog = { message: null, type: null, element: null, count: 1 };
    };

    const setupConsoleRedirection = () => {
        return `
            <script>
                function safeStringify(obj) {
                    const cache = new Set();
                    return JSON.stringify(obj, function(key, value) {
                        if (typeof value === 'object' && value !== null) {
                            if (cache.has(value)) return '[Circular]';
                            cache.add(value);
                        }
                        return value;
                    }, 2);
                }
                function stringifyArgs(args) {
                    return args.map(arg => {
                        try {
                            if (typeof arg === 'object' && arg !== null) {
                                return safeStringify(arg);
                            }
                            return String(arg);
                        } catch (e) {
                            return '[Serialization Error]';
                        }
                    }).join(' ');
                }
                const originalConsole = {};
                ['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
                    originalConsole[method] = window.console[method].bind(window.console);
                });
                const redirectConsole = (method) => {
                    window.console[method] = (...args) => {
                        originalConsole[method](...args);
                        parent.postMessage({ type: 'log', method: method, message: stringifyArgs(args) }, '*');
                    };
                };
                window.onerror = (message, source, lineno, colno, error) => {
                    parent.postMessage({ type: 'log', method: 'error', message: \`[Uncaught Error]\\n\${message}\nLine: \${lineno}, Col: \${colno}\` }, '*');
                    return true;
                };
                window.addEventListener('unhandledrejection', (event) => {
                    parent.postMessage({ type: 'log', method: 'error', message: \`[Unhandled Promise Rejection]\\n\${event.reason}\` }, '*');
                });
                ['log', 'error', 'warn', 'info', 'debug'].forEach(redirectConsole);
            </script>
        `;
    };

    const runCode = () => {
        clearConsole();
        updateFileContentFromEditor();
        updatePreview();
        if (window.innerWidth < 1024) {
            document.querySelector('#mobile-view-tabs [data-page="preview"]').click();
        } else {
            document.querySelector('.panel-tabs [data-panel="preview"]').click();
        }
    };

    const updatePreview = () => {
        const findFileByName = (name, tree = state.fileTree) => {
            for (const item of tree) {
                if (item.type === 'file' && item.name === name) return item;
                if (item.type === 'folder') {
                    const found = findFileByName(name, item.children);
                    if (found) return found;
                }
            }
            return null;
        };

        const htmlFile = findFileByName('index.html');
        let htmlContent = htmlFile ? htmlFile.content : '<body><h1>No index.html file found.</h1></body>';

        htmlContent = htmlContent.replace(/<link[^>]*href=["']([^"']*\.css)["'][^>]*>/gi, (match, cssPath) => {
            const cssFile = findFileByName(cssPath);
            return cssFile ? `<style>\n/* Inlined from ${cssPath} */\n${cssFile.content}\n</style>` : match;
        });

        htmlContent = htmlContent.replace(/<script[^>]*src=["']([^"']*\.js)["'][^>]*><\/script>/gi, (match, jsPath) => {
            const jsFile = findFileByName(jsPath);
            return jsFile ? `<script type="module">\n/* Inlined from ${jsPath} */\n${jsFile.content}\n</script>` : match;
        });

        const consoleScript = setupConsoleRedirection();
        if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `${consoleScript}</head>`);
        } else {
            htmlContent = consoleScript + htmlContent;
        }

        elements.previewIframe.srcdoc = htmlContent;
    };

    const handleSearch = () => {
        const term = elements.searchInput.value.toLowerCase();
        if (!term) {
            elements.searchResults.innerHTML = '';
            return;
        }

        let results = [];
        const searchTree = (tree) => {
            for (const item of tree) {
                if (item.type === 'file' && item.content.toLowerCase().includes(term)) {
                    const firstLine = item.content.toLowerCase().split('\n').findIndex(line => line.includes(term)) + 1;
                    results.push({ ...item, firstLine });
                }
                if (item.type === 'folder') searchTree(item.children);
            }
        };

        searchTree(state.fileTree);

        elements.searchResults.innerHTML = results.map(item =>
            `<div class="search-result-item p-1.5 rounded hover:bg-code-bg cursor-pointer text-sm" data-id="${item.id}" data-line="${item.firstLine}">
                <i class="${getIconForFile(item.name)} mr-2"></i>
                ${item.name} (line ${item.firstLine})
            </div>`
        ).join('');
    };

    const toggleSidebar = (force) => {
        const show = force !== undefined ? force : !elements.sidebar.classList.contains('active');
        elements.sidebar.classList.toggle('active', show);
        elements.sidebarOverlay.classList.toggle('hidden', !show);
    };

    const downloadProjectAsZip = () => {
        updateFileContentFromEditor();
        const zip = new JSZip();

        const addFolderToZip = (folder, zipFolder) => {
            folder.children.forEach(item => {
                if (item.type === 'file') {
                    zipFolder.file(item.name, item.content);
                } else if (item.type === 'folder') {
                    const newZipFolder = zipFolder.folder(item.name);
                    addFolderToZip(item, newZipFolder);
                }
            });
        };

        addFolderToZip({ children: state.fileTree }, zip);

        zip.generateAsync({ type: "blob" }).then(content => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = "knowledge-ide-project.zip";
            link.click();
        });
    };

    const savePanelHeight = () => {
        state.settings.bottomPanelHeight = elements.bottomPanelArea.style.height;
        saveState();
    }

    const loadPanelHeight = () => {
        elements.bottomPanelArea.style.height = state.settings.bottomPanelHeight;
    }

    const setupVerticalResizing = () => {
        let isDragging = false;

        elements.resizeHandleY.addEventListener('mousedown', (e) => {
            isDragging = true;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'row-resize';
            if(editor) editor.updateOptions({ readOnly: true });
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const panelWrapperRect = elements.editorPanelWrapper.getBoundingClientRect();
            const newBottomPanelHeight = panelWrapperRect.bottom - e.clientY;
            const minHeight = 35;
            const maxHeight = panelWrapperRect.height - 100;

            if (newBottomPanelHeight >= minHeight && newBottomPanelHeight <= maxHeight) {
                elements.bottomPanelArea.style.height = `${newBottomPanelHeight}px`;
                if(editor) editor.layout();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                if(editor) editor.updateOptions({ readOnly: false });
                savePanelHeight();
            }
        });
    };

    function addEventListeners() {
        elements.fileExplorerContainer.addEventListener('click', e => {
            const targetItem = e.target.closest('.file-explorer-item');
            if (e.target.classList.contains('rename-input')) return;

            if (e.target.classList.contains('item-name')) {
                const id = targetItem?.dataset.id;
                if (id) {
                    state.renamingItemId = id;
                    renderFileExplorer();
                }
                return;
            }

            if (state.renamingItemId) {
                const oldInput = elements.fileExplorerContainer.querySelector(`.rename-input[data-id="${state.renamingItemId}"]`);
                if(oldInput && !oldInput.contains(e.target)) {
                    handleRename(oldInput.dataset.id, oldInput.value);
                }
            }

            if (!targetItem) return;
            const id = targetItem.dataset.id;
            const result = findItem(id);
            if (!result) return;

            state.selectedItemId = id;

            if (e.target.closest('.delete-item-btn')) { deleteItem(id); return; }

            if (result.item.type === 'folder') {
                if (e.target.closest('.folder-toggle-icon') || e.target.closest('.folder-item > div > span')) {
                     result.item.isOpen = !result.item.isOpen;
                     updateUI();
                }
            }
            else if (result.item.type === 'file') { openFile(id); }
        });

        elements.fileExplorerContainer.addEventListener('dblclick', e => {
            const target = e.target.closest('.file-explorer-item');
            if (!target || e.target.classList.contains('rename-input')) return;
            const id = target.dataset.id;
            state.renamingItemId = id;
            renderFileExplorer();
        });

        elements.fileExplorerContainer.addEventListener('focusout', e => {
            if (e.target.classList.contains('rename-input')) {
                handleRename(e.target.dataset.id, e.target.value);
            }
        });

        elements.fileExplorerContainer.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.classList.contains('rename-input')) {
                e.target.blur();
            }
        });

        elements.fileExplorerContainer.addEventListener('mouseover', e => { e.target.closest('.file-explorer-item')?.querySelector('.delete-item-btn')?.classList.remove('hidden'); });
        elements.fileExplorerContainer.addEventListener('mouseout', e => { e.target.closest('.file-explorer-item')?.querySelector('.delete-item-btn')?.classList.add('hidden'); });

        elements.tabBar.addEventListener('click', e => {
            const tab = e.target.closest('.tab');
            if (!tab) return;
            if (e.target.closest('.close-tab-btn')) closeFile(tab.dataset.id);
            else setActiveFile(tab.dataset.id);
        });

        document.querySelector('.activity-bar').addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            const view = button.dataset.view;
            const currentTime = Date.now();
        
            if (view === lastActivityBarClick.view && (currentTime - lastActivityBarClick.time < 500) && elements.sidebar.classList.contains('active')) {
                toggleSidebar(false);
                lastActivityBarClick = { view: null, time: 0 }; 
                return;
            }
        
            elements.activityBarButtons.forEach(b => b.classList.remove('active-icon'));
            button.classList.add('active-icon');
            elements.sidebarViews.forEach(v => v.classList.add('hidden'));
            document.getElementById(`${view}-view`).classList.remove('hidden');
            state.settings.activeSidebarView = view;
            
            if (!elements.sidebar.classList.contains('active')) {
                toggleSidebar(true);
            }
        
            lastActivityBarClick = { view, time: currentTime };
        });

        document.querySelector('.panel-tabs').addEventListener('click', e => {
            const button = e.target.closest('.panel-tab-btn');
            if (!button) return;
            const panel = button.dataset.panel;
            document.querySelectorAll('.panel-tab-btn').forEach(b => b.classList.remove('active-panel-tab'));
            button.classList.add('active-panel-tab');
            document.querySelectorAll('.bottom-panel-content').forEach(p => p.classList.add('hidden'));
            document.getElementById(`${panel}-panel`).classList.remove('hidden');
            if (panel === 'preview') updatePreview();
        });

        elements.themeSelector.addEventListener('change', (e) => monaco.editor.setTheme(e.target.value));
        elements.autoRunCheckbox.addEventListener('change', (e) => {
            state.settings.autoRun = e.target.checked;
            saveState();
            if(state.settings.autoRun) runCode();
        });

        elements.searchInput.addEventListener('input', handleSearch);
        elements.searchResults.addEventListener('click', e => {
            const item = e.target.closest('.search-result-item');
            if (item) {
                const fileId = item.dataset.id;
                const line = parseInt(item.dataset.line || '1');
                openFile(fileId);
                if (editor) {
                    editor.revealLineInCenter(line);
                    editor.setPosition({ lineNumber: line, column: 1 });
                    editor.focus();
                }
                document.querySelector('.activity-bar [data-view="explorer"]').click();
            }
        });

        elements.sidebarToggle.addEventListener('click', () => toggleSidebar());
        elements.sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
        [elements.runButton, elements.headerRunBtn].forEach(btn => btn.addEventListener('click', runCode));
        elements.headerSaveBtn.addEventListener('click', downloadProjectAsZip);
        [elements.newFileBtn, elements.menuNewFile].forEach(btn => btn.addEventListener('click', () => createNewItem('file')));
        [elements.newFolderBtn, elements.menuNewFolder].forEach(btn => btn.addEventListener('click', () => createNewItem('folder')));

        window.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveState(true); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); createNewItem('file'); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); }
        });
        window.addEventListener('beforeunload', () => saveState());
        window.addEventListener('message', (event) => {
            if (event.source === elements.previewIframe.contentWindow && event.data.type === 'log') {
                logToConsole(event.data.method, event.data.message);
            }
        });

        elements.mobileViewTabs.addEventListener('click', e => {
            const button = e.target.closest('.mobile-tab-btn');
            if (!button) return;

            const pageName = button.dataset.page;
            const pages = { editor: elements.editorPage, console: elements.consolePage, preview: elements.previewPage };

            elements.mobileViewTabs.querySelectorAll('.mobile-tab-btn').forEach(btn => btn.classList.remove('active-panel-tab'));
            button.classList.add('active-panel-tab');

            Object.values(pages).forEach(page => page.classList.remove('mobile-view-active'));

            if (pages[pageName]) {
                pages[pageName].classList.add('mobile-view-active');
                if (pageName === 'editor') {
                    elements.editorContainer.style.display = 'block';
                    setTimeout(() => { if (editor) editor.layout(); }, 50);
                }
                if (pageName === 'preview') updatePreview();
            }
        });

        setupVerticalResizing();
    }

    function initializeLayout() {
        if (window.innerWidth < 1024) {
            document.querySelector('#mobile-view-tabs [data-page="editor"]').click();
        } else {
            [elements.editorPage, elements.consolePage, elements.previewPage].forEach(page => page.classList.remove('mobile-view-active'));
            elements.editorPage.style.display = 'flex';
        }
    }

    monaco.editor.defineTheme('knowledgeDark', {
        base: 'vs-dark', inherit: true,
        rules: [ { token: 'comment', foreground: '57a64a' } ],
        colors: { 'editor.background': '#1e1e1e', 'editorCursor.foreground': '#ffc700' }
    });

    editor = monaco.editor.create(elements.editorContainer, {
        value: '', language: 'plaintext', theme: 'knowledgeDark',
        automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false,
        fontFamily: 'Consolas, "Courier New", monospace', fontSize: 14, padding: { top: 10 }
    });

    editor.onDidBlurEditorWidget(updateFileContentFromEditor);
    editor.onDidChangeCursorPosition(e => {
        elements.cursorPosition.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
        elements.encodingStatus.textContent = 'UTF-8';
        elements.indentStatus.textContent = `Spaces: ${editor.getOptions().get(monaco.editor.EditorOption.tabSize)}`;
    });

    loadState();
    loadPanelHeight();
    addEventListeners();
    updateUI();
    initializeLayout();

    document.querySelector(`.activity-bar [data-view="${state.settings.activeSidebarView}"]`)?.click();
    if(state.activeFileId) setActiveFile(state.activeFileId);

    window.addEventListener('resize', () => {
        initializeLayout();
        if(editor) editor.layout();
    });

    function openSplitEditor(fileId) {
        if (splitEditor) {
            splitEditor.dispose();
            splitEditor = null;
        }
        const splitContainer = document.createElement('div');
        splitContainer.id = 'split-editor-container';
        splitContainer.style.cssText = 'width:50%;height:100%;position:absolute;right:0;top:0;z-index:10;border-left:1px solid #333;background:#1e1e1e;';
        elements.editorContainer.parentNode.appendChild(splitContainer);

        const result = findItem(fileId);
        if (!result) return;
        splitEditor = monaco.editor.create(splitContainer, {
            value: result.item.content,
            language: result.item.language,
            theme: 'knowledgeDark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            padding: { top: 10 }
        });
    }

    const splitEditorBtn = document.getElementById('split-editor-btn');
    if (splitEditorBtn) {
        splitEditorBtn.addEventListener('click', () => {
            const idx = state.openFiles.indexOf(state.activeFileId);
            const splitId = state.openFiles[(idx + 1) % state.openFiles.length] || state.activeFileId;
            openSplitEditor(splitId);
        });
    }

    const commands = [
        { name: 'New File', action: () => createNewItem('file') },
        { name: 'New Folder', action: () => createNewItem('folder') },
        { name: 'Save Project', action: () => saveState(true) },
        { name: 'Run Code', action: () => runCode() },
        { name: 'Toggle Sidebar', action: () => toggleSidebar() },
        { name: 'Split Editor', action: () => document.getElementById('split-editor-btn').click() }
    ];

    commands.push(
        { name: 'Format Document', action: () => editor.getAction('editor.action.formatDocument').run() },
        { name: 'Toggle Line Comment', action: () => editor.getAction('editor.action.commentLine').run() }
    );

    const palette = document.getElementById('command-palette');
    const input = document.getElementById('command-input');
    const list = document.getElementById('command-list');

    function showCommandPalette() {
        palette.classList.remove('hidden');
        input.value = '';
        input.focus();
        renderCommandList('');
    }

    function hideCommandPalette() {
        palette.classList.add('hidden');
    }

    function renderCommandList(filter) {
        const filtered = commands.filter(cmd => cmd.name.toLowerCase().includes(filter.toLowerCase()));
        list.innerHTML = filtered.map(cmd => `<div class="px-4 py-2 hover:bg-code-bg cursor-pointer">${cmd.name}</div>`).join('');
        Array.from(list.children).forEach((el, i) => {
            el.onclick = () => {
                filtered[i].action();
                hideCommandPalette();
            };
        });
    }

    input.addEventListener('input', e => renderCommandList(e.target.value));
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') hideCommandPalette();
    });

    window.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            showCommandPalette();
        }
    });

    window.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
            e.preventDefault();
            showFileSearchPalette();
        }
    });

    function showFileSearchPalette() {
        palette.classList.remove('hidden');
        input.value = '';
        input.placeholder = 'Type file name...';
        renderFileList('');
        input.focus();
    }

    function renderFileList(filter) {
        const files = [];
        function walk(tree) {
            tree.forEach(item => {
                if (item.type === 'file') files.push(item);
                if (item.type === 'folder') walk(item.children);
            });
        }
        walk(state.fileTree);
        const filtered = files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
        list.innerHTML = filtered.map(f => `<div class="px-4 py-2 hover:bg-code-bg cursor-pointer">${f.name}</div>`).join('');
        Array.from(list.children).forEach((el, i) => {
            el.onclick = () => {
                openFile(filtered[i].id);
                hideCommandPalette();
            };
        });
    }
    input.addEventListener('input', e => {
        if (input.placeholder === 'Type file name...') renderFileList(e.target.value);
        else renderCommandList(e.target.value);
    });
});
