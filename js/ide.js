tailwind.config = {
    theme: {
        extend: {
            colors: {
                'blackish': '#0a0a0a', // Deep charcoal background
                'primary': '#FFC700', // Primary CTA Yellow (vibrant)
                'primary-hover': '#FDB813', // Darker yellow for hover state
                'secondary': '#61dafb', // Code highlight/Secondary Cyan
                'code-bg': '#1e1e1e', // IDE background
                'sidebar-bg': '#161616', // Darker than code-bg
                'panel-bg': '#1b1b1b', // Slightly lighter for panels
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

require.config({ 
    paths: { 
        'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs',
        'jszip': 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min'
    } 
});

require(['vs/editor/editor.main', 'jszip'], function(_, JSZip) {
    let state = {
        fileTree: [
            { id: 'folder-1', name: 'src', type: 'folder', children: [
                { id: '1', name: 'script.js', type: 'file', language: 'javascript', content: `// Welcome to Knowledge IDE! 🚀\nconsole.log("Hello, World!");\nconsole.warn("This is a warning.");\nconsole.error({ message: "An error object!" });\ndocument.body.querySelector('h1').style.color = 'orange';` },
                { id: '2', name: 'index.html', type: 'file', language: 'html', content: `<!DOCTYPE html>\n<html>\n  <head>\n    <link rel="stylesheet" href="style.css">\n    <title>My App</title>\n  </head>\n  <body>\n    <h1>Hello from HTML!</h1>\n    <script src="script.js"><\/script>\n  </body>\n</html>` },
                { id: '3', name: 'style.css', type: 'file', language: 'css', content: `body {\n  background-color: #f0f0f0;\n  font-family: sans-serif;\n  color: #333;\n}` },
            ], isOpen: true },
        ],
        openFiles: [],
        activeFileId: null,
        selectedItemId: null,
        renamingItemId: null,
        settings: { autoRun: false }
    };

    const elements = {
        fileExplorerContainer: document.getElementById('file-explorer-container'),
        tabBar: document.getElementById('tab-bar'),
        editorContainer: document.getElementById('editor-container'),
        welcomeScreen: document.getElementById('welcome-screen'),
        consolePanel: document.getElementById('console-panel'),
        previewIframe: document.getElementById('preview-iframe'),
        errorDebugger: document.getElementById('error-debugger'),
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
    };
    
    function saveState(showNotification = false) {
        try { 
            if(state.activeFileId) updateFileContentFromEditor(); 
            state.settings.bottomPanelHeight = elements.bottomPanelArea.style.height;

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
        for (const item of tree) { if (item.id === itemId) return {item, parent: tree}; if (item.type === 'folder') { const found = findItem(itemId, item.children); if (found) return found; } } return null; };
    const getIconForFile = (name) => {
        if (name.endsWith('.js')) return 'fab fa-js-square text-yellow-400';
        if (name.endsWith('.html')) return 'fab fa-html5 text-red-500';
        if (name.endsWith('.css')) return 'fab fa-css3-alt text-blue-500';
        return 'fas fa-file text-gray-400';
    };
    const getLanguageForFile = (name) => (name.endsWith('.js') ? 'javascript' : (name.endsWith('.html') ? 'html' : (name.endsWith('.css') ? 'css' : 'plaintext')));
    const generateUniqueName = (baseName, parent) => { let newName = baseName; let counter = 1; while (parent.some(item => item.name === newName)) { const extension = baseName.includes('.') ? '.' + baseName.split('.').pop() : ''; const nameWithoutExt = baseName.includes('.') ? baseName.substring(0, baseName.lastIndexOf('.')) : baseName; newName = `${nameWithoutExt}(${counter})${extension}`; counter++; } return newName; };

    const renderFileExplorer = () => {
        const renderNode = (node, level) => {
            const indent = level * 16;
            const isSelected = state.selectedItemId === node.id ? 'selected' : '';
            const isRenaming = state.renamingItemId === node.id;
            const nameContent = isRenaming ? `<input type="text" class="rename-input" value="${node.name}" data-id="${node.id}" />` : `<span class="item-name">${node.name}</span>`;

            if (node.type === 'folder') {
                const isCollapsed = node.isOpen === false ? 'collapsed' : '';
                return `<div class="folder-item file-explorer-item ${isSelected} ${isCollapsed}" data-id="${node.id}" style="padding-left: ${indent}px;"><div class="flex items-center justify-between py-1 cursor-pointer"><span><i class="folder-toggle-icon fas fa-chevron-down w-4"></i><i class="fas fa-folder text-primary mr-2"></i>${nameContent}</span><button class="delete-item-btn text-gray-600 hover:text-red-500 hidden" data-id="${node.id}"><i class="fas fa-trash-alt"></i></button></div></div><div class="folder-content ${isCollapsed ? 'hidden' : ''}">${node.children.map(child => renderNode(child, level + 1)).join('')}</div>`;
            } else {
                return `<div class="file-item file-explorer-item ${isSelected}" data-id="${node.id}" style="padding-left: ${indent}px;"><div class="flex items-center justify-between py-1 cursor-pointer"><span><i class="${getIconForFile(node.name)} mr-2 w-4 text-center"></i>${nameContent}</span><button class="delete-item-btn text-gray-600 hover:text-red-500 hidden" data-id="${node.id}"><i class="fas fa-trash-alt"></i></button></div></div>`;
            }
        };
        elements.fileExplorerContainer.innerHTML = state.fileTree.map(node => renderNode(node, 0)).join('');
        const renameInput = elements.fileExplorerContainer.querySelector('.rename-input');
        if (renameInput) { renameInput.focus(); renameInput.select(); }
    };
    const renderTabs = () => { elements.tabBar.innerHTML = state.openFiles.map(fileId => { const result = findItem(fileId); if (!result) return ''; const file = result.item; return `<div class="tab h-full flex items-center px-4 text-sm cursor-pointer ${state.activeFileId === fileId ? 'active-tab' : 'text-gray-400 hover:bg-[#252525]'}" data-id="${file.id}"><i class="${getIconForFile(file.name)} mr-2"></i>${file.name}<i class="close-tab-btn fas fa-times ml-3 text-gray-500 hover:text-white" data-id="${file.id}"></i></div>`; }).join(''); };
    const updateEditor = () => { if (state.activeFileId) { const result = findItem(state.activeFileId); if (!result) { state.activeFileId = null; return; } const file = result.item; elements.welcomeScreen.style.display = 'none'; elements.editorContainer.style.display = 'block'; if (editor.getValue() !== file.content) { editor.setValue(file.content); monaco.editor.setModelLanguage(editor.getModel(), file.language); } elements.languageStatus.textContent = file.language.charAt(0).toUpperCase() + file.language.slice(1); } else { elements.welcomeScreen.style.display = 'flex'; elements.editorContainer.style.display = 'none'; } };
    const updateUI = () => { renderFileExplorer(); renderTabs(); updateEditor(); saveState(); };

    const updateFileContentFromEditor = () => { if (state.activeFileId) { const result = findItem(state.activeFileId); if (result) result.item.content = editor.getValue(); } };
    const openFile = (fileId) => { if (!state.openFiles.includes(fileId)) state.openFiles.push(fileId); setActiveFile(fileId); if (window.innerWidth < 1024) toggleSidebar(false); };
    const setActiveFile = (fileId) => { updateFileContentFromEditor(); state.activeFileId = fileId; state.selectedItemId = fileId; state.renamingItemId = null; updateUI(); };
    const closeFile = (fileId) => { state.openFiles = state.openFiles.filter(id => id !== fileId); if (state.activeFileId === fileId) { state.activeFileId = state.openFiles[state.openFiles.length - 1] || null; } updateUI(); };
    const createNewItem = (type) => { const baseName = type === 'file' ? 'untitled.js' : 'NewFolder'; let parentList = state.fileTree; const selected = state.selectedItemId ? findItem(state.selectedItemId) : null; if (selected) { if (selected.item.type === 'folder') { parentList = selected.item.children; selected.item.isOpen = true; } else { parentList = selected.parent; } } const name = generateUniqueName(baseName, parentList); const newItem = { id: Date.now().toString(), name, type }; if (type === 'file') { newItem.language = getLanguageForFile(name); newItem.content = `// ${name}`; } else { newItem.children = []; newItem.isOpen = true; } parentList.push(newItem); if (type === 'file') openFile(newItem.id); else updateUI(); };
    const deleteItem = (itemId) => { const found = findItem(itemId); if (!found) return; const { item, parent } = found; const deleteRecursively = (folder) => folder.children.forEach(child => child.type === 'file' ? closeFile(child.id) : deleteRecursively(child)); if (item.type === 'folder') deleteRecursively(item); else closeFile(item.id); const index = parent.findIndex(i => i.id === itemId); if (index > -1) parent.splice(index, 1); updateUI(); };
    
    // --- CONSOLE REDIRECTION FUNCTIONS ---

    const logToConsole = (type, message) => {
        const logEntry = document.createElement('div');
        logEntry.className = `p-1 border-b border-panel-bg text-sm font-mono whitespace-pre-wrap`;
        
        let iconClass = '';
        let textClass = 'text-gray-200';

        switch (type) {
            case 'log':
                iconClass = 'text-gray-400 fas fa-info-circle';
                break;
            case 'warn':
                iconClass = 'text-yellow-500 fas fa-exclamation-triangle';
                textClass = 'text-yellow-300';
                break;
            case 'error':
                iconClass = 'text-red-500 fas fa-times-circle';
                textClass = 'text-red-400';
                break;
            default:
                iconClass = 'text-gray-400 fas fa-info-circle';
        }
        
        let content;
        try {
            content = JSON.parse(message);
            content = typeof content === 'object' ? JSON.stringify(content, null, 2) : message;
        } catch (e) {
            content = message;
        }

        logEntry.innerHTML = `<span class="mr-2 ${iconClass}"></span><span class="${textClass}">${content}</span>`;
        elements.consolePanel.appendChild(logEntry);
        elements.consolePanel.scrollTop = elements.consolePanel.scrollHeight;
    };

    const clearConsole = () => {
        elements.consolePanel.innerHTML = '';
    };

    const setupConsoleRedirection = () => {
        return `
            <script>
                const originalConsole = window.console;

                const redirectConsole = (method) => {
                    const originalMethod = originalConsole[method];
                    window.console[method] = (...args) => {
                        if (originalMethod) originalMethod.apply(originalConsole, args);

                        const message = args.map(arg => {
                            try {
                                // Stringify objects/arrays to safely send across origins
                                return typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg);
                            } catch (e) {
                                return 'Error stringifying object';
                            }
                        }).join(' ');

                        // Post the log message back to the main IDE window
                        parent.postMessage({
                            type: 'log',
                            method: method, 
                            message: message
                        }, '*'); 
                    };
                };

                ['log', 'error', 'warn'].forEach(redirectConsole);

                // Catch global errors (script execution errors)
                window.onerror = function (message, source, lineno, colno, error) {
                    parent.postMessage({
                        type: 'log',
                        method: 'error',
                        message: \`[Uncaught Error]: \${message}\nLine: \${lineno}, Column: \${colno}\`
                    }, '*');
                    return true;
                };
            </\script>
        `;
    };
    
    // --- CORE IDE FUNCTIONS ---
    
    const runCode = () => { 
        clearConsole();
        updatePreview(); 
        document.querySelector('[data-panel="preview"]').click(); 
    };
    
    const updatePreview = () => {
        const findFileByName = (name, tree = state.fileTree) => { for (const item of tree) { if (item.type === 'file' && item.name === name) return item; if (item.type === 'folder') { const found = findFileByName(name, item.children); if (found) return found; } } return null; };
        const htmlFile = findFileByName('index.html') || state.fileTree.find(f => f.name && f.name.endsWith('.html'));
        let htmlContent = htmlFile ? htmlFile.content : '<body><h1>No HTML file found.</h1><p>Create an <strong>index.html</strong> to see a preview.</p></body>';
        
        htmlContent = htmlContent.replace(/<link.*href="(.*\.css)".*>/g, (match, cssPath) => {
            const cssFile = findFileByName(cssPath); return cssFile ? `<style>${cssFile.content}</style>` : match;
        });
        htmlContent = htmlContent.replace(/<script.*src="(.*\.js)".*><\/script>/g, (match, jsPath) => {
            const jsFile = findFileByName(jsPath); return jsFile ? `<script>${jsFile.content}<\/script>` : match;
        });

        const consoleScript = setupConsoleRedirection();
        
        let finalHtmlContent = htmlContent;
        if (finalHtmlContent.includes('</head>')) {
             finalHtmlContent = finalHtmlContent.replace('</head>', `${consoleScript}</head>`);
        } else if (finalHtmlContent.includes('<body>')) {
             finalHtmlContent = finalHtmlContent.replace('<body>', `<body>${consoleScript}`);
        } else {
             finalHtmlContent = finalHtmlContent.replace('</html>', `${consoleScript}</html>`);
        }

        elements.previewIframe.srcdoc = finalHtmlContent;
    };
    
    const handleRename = (itemId, newName) => { 
        const found = findItem(itemId); 
        if (!found || !newName) { 
            state.renamingItemId = null; 
            updateUI(); 
            return; 
        } 
        const { item } = found; 
        item.name = newName; 
        
        if(item.type === 'file') item.language = getLanguageForFile(newName); 
        
        state.renamingItemId = null; 
        updateUI(); 
    };

    const handleSearch = () => { const term = elements.searchInput.value.toLowerCase(); if (!term) { elements.searchResults.innerHTML = ''; return; } let results = []; const searchTree = (tree) => { for (const item of tree) { if (item.type === 'file' && item.content.toLowerCase().includes(term)) results.push(item); if (item.type === 'folder') searchTree(item.children); } }; searchTree(state.fileTree); elements.searchResults.innerHTML = results.map(item => `<div class="search-result-item p-1.5 rounded hover:bg-code-bg cursor-pointer text-sm" data-id="${item.id}"><i class="${getIconForFile(item.name)} mr-2"></i>${item.name}</div>`).join(''); };
    const toggleSidebar = (force) => {
        const show = force !== undefined ? force : !elements.sidebar.classList.contains('active');
        elements.sidebar.classList.toggle('active', show);
        elements.sidebarOverlay.classList.toggle('hidden', !show);
    };

    const downloadProjectAsZip = () => { const zip = new JSZip(); const addFolderToZip = (folder, zipFolder) => { folder.children.forEach(item => { if (item.type === 'file') { zipFolder.file(item.name, item.content); } else if (item.type === 'folder') { const newZipFolder = zipFolder.folder(item.name); addFolderToZip(item, newZipFolder); } }); }; addFolderToZip({ children: state.fileTree }, zip); zip.generateAsync({ type: "blob" }).then(content => { const link = document.createElement('a'); link.href = URL.createObjectURL(content); link.download = "knowledge-ide-project.zip"; document.body.appendChild(link); link.click(); document.body.removeChild(link); }); };

    // --- RESIZING FUNCTIONS ---

    const savePanelHeight = () => {
        state.settings.bottomPanelHeight = elements.bottomPanelArea.style.height;
        saveState();
    }
    
    const loadPanelHeight = () => {
        if (state.settings.bottomPanelHeight) {
            elements.bottomPanelArea.style.height = state.settings.bottomPanelHeight;
        } else {
            elements.bottomPanelArea.style.height = '200px'; 
        }
    }
    
    const setupVerticalResizing = () => {
        let isDragging = false;
        
        elements.resizeHandleY.addEventListener('mousedown', (e) => {
            isDragging = true;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'row-resize';
            editor.getConfiguration().readOnly = true; 
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const panelWrapperRect = elements.editorPanelWrapper.getBoundingClientRect();
            const newBottomPanelHeight = panelWrapperRect.bottom - e.clientY;
            
            const minHeight = 35;
            const maxHeight = panelWrapperRect.height - 100;

            if (newBottomPanelHeight >= minHeight && newBottomPanelHeight <= maxHeight) {
                elements.bottomPanelArea.style.height = `${newBottomPanelHeight}px`;
                elements.editorArea.style.flexGrow = 1; 
                elements.bottomPanelArea.style.flexShrink = 0; 
                editor.layout(); 
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                editor.getConfiguration().readOnly = false; 
                savePanelHeight();
            }
        });
    };
    
    // --- EVENT LISTENERS ---

    function addEventListeners() {
        elements.fileExplorerContainer.addEventListener('dblclick', e => { 
            const target = e.target.closest('.file-explorer-item'); 
            if (!target) {
                console.log("DBLCLICK: No file-explorer-item found on double click.");
                return;
            }
            const id = target.dataset.id; 
            const itemType = findItem(id)?.item.type || 'Unknown';
            
            console.log(`DBLCLICK: Renaming initiated for ${itemType} with ID: ${id}`);
            
            state.renamingItemId = id; 
            renderFileExplorer(); 
        });
        
        elements.fileExplorerContainer.addEventListener('click', e => { 
            if (e.target.classList.contains('rename-input')) return; 
            const target = e.target.closest('.file-explorer-item'); 
            if (!target) return; 
            const id = target.dataset.id; 
            
            if (state.renamingItemId && state.renamingItemId !== id) { 
                const oldInput = document.querySelector('.rename-input'); 
                if(oldInput) handleRename(oldInput.dataset.id, oldInput.value); 
            } 
            
            state.selectedItemId = id; 
            const result = findItem(id); 
            if (!result) return; 
            
            if (e.target.closest('.delete-item-btn')) { 
                deleteItem(id); 
                return; 
            } 
            
            console.log(`CLICK: Item ID ${id} clicked. e.detail: ${e.detail}. Item Type: ${result.item.type}`);
            
            if (result.item.type === 'folder' && !e.target.closest('.item-name')) { 
                result.item.isOpen = !result.item.isOpen; 
                updateUI(); 
            } else if (result.item.type === 'file') { 
                if (e.detail === 1) {
                    openFile(id); 
                }
            } 
        });
        
        elements.fileExplorerContainer.addEventListener('focusout', e => { 
            if (e.target.classList.contains('rename-input')) 
                handleRename(e.target.dataset.id, e.target.value); 
        });
        elements.fileExplorerContainer.addEventListener('keydown', e => { 
            if (e.key === 'Enter' && e.target.classList.contains('rename-input')) 
                handleRename(e.target.dataset.id, e.target.value); 
        });
        
        elements.fileExplorerContainer.addEventListener('mouseover', e => { e.target.closest('.file-explorer-item')?.querySelector('.delete-item-btn')?.classList.remove('hidden'); });
        elements.fileExplorerContainer.addEventListener('mouseout', e => { e.target.closest('.file-explorer-item')?.querySelector('.delete-item-btn')?.classList.add('hidden'); });
        elements.tabBar.addEventListener('click', e => { const tab = e.target.closest('.tab'); if (!tab) return; if (e.target.closest('.close-tab-btn')) closeFile(tab.dataset.id); else setActiveFile(tab.dataset.id); });
        document.querySelector('.activity-bar').addEventListener('click', e => { const button = e.target.closest('button'); if (!button) return; const view = button.dataset.view; document.querySelectorAll('.activity-bar button').forEach(b => b.classList.remove('active-icon')); button.classList.add('active-icon'); document.querySelectorAll('.sidebar-view').forEach(v => v.classList.add('hidden')); document.getElementById(`${view}-view`).classList.remove('hidden'); if(window.innerWidth < 1024 && !elements.sidebar.classList.contains('active')) { toggleSidebar(true); }});
        document.querySelector('.panel-tabs').addEventListener('click', e => { const button = e.target.closest('.panel-tab-btn'); if (!button) return; const panel = button.dataset.panel; document.querySelectorAll('.panel-tab-btn').forEach(b => b.classList.remove('active-panel-tab')); button.classList.add('active-panel-tab'); document.querySelectorAll('.bottom-panel-content').forEach(p => p.classList.add('hidden')); document.getElementById(`${panel}-panel`).classList.remove('hidden'); if (panel === 'preview') updatePreview(); });
        elements.themeSelector.addEventListener('change', (e) => monaco.editor.setTheme(e.target.value));
        elements.autoRunCheckbox.addEventListener('change', (e) => { state.settings.autoRun = e.target.checked; saveState(); });
        elements.searchInput.addEventListener('input', handleSearch);
        elements.searchResults.addEventListener('click', e => { const item = e.target.closest('.search-result-item'); if (item) { const result = findItem(item.dataset.id); if (result.item.type === 'file') openFile(item.dataset.id); } });
        elements.sidebarToggle.addEventListener('click', () => toggleSidebar());
        elements.sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
        [elements.runButton, elements.headerRunBtn].forEach(btn => btn.addEventListener('click', runCode));
        elements.headerSaveBtn.addEventListener('click', downloadProjectAsZip);
        [elements.newFileBtn, elements.menuNewFile].forEach(btn => btn.addEventListener('click', () => createNewItem('file')));
        [elements.newFolderBtn, elements.menuNewFolder].forEach(btn => btn.addEventListener('click', () => createNewItem('folder')));
        window.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveState(true); } });
        window.addEventListener('beforeunload', () => saveState());
        window.addEventListener('message', (event) => {
            if (event.source === elements.previewIframe.contentWindow && event.data.type === 'log') {
                logToConsole(event.data.method, event.data.message);
            }
        });

        setupVerticalResizing();
    }

    monaco.editor.defineTheme('knowledgeDark', { base: 'vs-dark', inherit: true, rules: [ { token: 'comment', foreground: '57a64a' }, { token: 'keyword', foreground: 'dcdcaa' }, { token: 'number', foreground: 'b5cea8' }, { token: 'string', foreground: 'ce9178' } ], colors: { 'editor.foreground': '#e5e5e5', 'editor.background': '#1e1e1e', 'editorLineNumber.foreground': '#555555', 'editor.selectionBackground': '#264f78', 'editorCursor.foreground': '#ffc700' } });
    editor = monaco.editor.create(elements.editorContainer, { value: '', language: 'javascript', theme: 'knowledgeDark', automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: 'Consolas, "Courier New", monospace', fontSize: 14, padding: { top: 10 } });
    editor.onDidBlurEditorWidget(updateFileContentFromEditor);
    editor.onDidChangeCursorPosition(e => { elements.cursorPosition.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`; });
    editor.onDidChangeModelContent(() => { if (state.settings.autoRun) { clearTimeout(autoRunTimeout); autoRunTimeout = setTimeout(runCode, 500); } });
    
    loadState();
    loadPanelHeight();
    addEventListeners();
    updateUI();
});