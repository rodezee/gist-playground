document.addEventListener('alpine:init', () => {
    Alpine.data('gistPlayground', () => ({
        view: 'home',
        pat: localStorage.getItem('github_pat') || '',
        searchUser: localStorage.getItem('last_user') || '',
        username: '',
        gists: [],
        files: {},
        activeFile: '',
        currentGistId: null,
        editor: null, // Store Ace instance
        isPublic: false,
        isLoading: false,

        init() {
            // 1. Parse URL params
            const params = new URLSearchParams(window.location.search);
            const user = params.get('user');
            const gistId = params.get('gist');

            // 2. Logic prioritization
            if (user && gistId) {
                // PRIORITY: If we have a direct link, load the Gist and DO NOT auto-load user list
                this.searchUser = user;
                this.username = user;
                this.openGist(gistId);
            } else if (this.searchUser) {
                // FALLBACK: If no direct link, load the last known user
                this.loadUserGists(this.searchUser);
            } else if (this.pat) {
                // AUTO-LOGIN: Only if we aren't loading a specific Gist, fetch the user via PAT
                this.getAuthenticatedUser();
            }
            
            // 3. Initialize Ace
            this.editor = ace.edit("editor");
            this.editor.setTheme("ace/theme/monokai");
            this.editor.setOptions({
                fontSize: "14px",
                showPrintMargin: false,
                wrap: true
            });

            this.editor.on("change", () => {
                // Check if we are currently switching files; if so, IGNORE the change
                if (this.isSwitching) return; 

                if (this.activeFile && this.files[this.activeFile]) {
                    this.files[this.activeFile].content = this.editor.getValue();
                    clearTimeout(this.previewTimer);
                    this.previewTimer = setTimeout(() => this.updatePreview(), 500);
                }
            });
        },

        async getAuthenticatedUser() {
            if (!this.pat) return;
            this.isLoading = true; // Start
            try {
                const res = await fetch('https://api.github.com/user', {
                    headers: { 'Authorization': `Bearer ${this.pat}` }
                });
                if (res.ok) {
                    const user = await res.json();
                    this.searchUser = user.login;
                    await this.loadUserGists(user.login); // Await this call
                }
            } finally {
                this.isLoading = false; // Stop
            }
        },

        async openGist(id) {
            this.isLoading = true;
            try {
                this.currentGistId = id;
                const params = new URLSearchParams(window.location.search);
                this.username = params.get('user') || this.searchUser;
                const headers = this.pat ? { 'Authorization': `Bearer ${this.pat}` } : {};
                const res = await fetch(`https://api.github.com/gists/${id}`, { headers });
                const data = await res.json();
                
                this.files = data.files;
                this.isPublic = data.public;
                this.activeFile = this.files['index.html'] ? 'index.html' : Object.keys(this.files)[0];
                this.view = 'playground';

                const newUrl = new URL(window.location.origin + window.location.pathname);
                newUrl.searchParams.set('user', this.username);
                newUrl.searchParams.set('gist', id);
                window.history.replaceState({}, '', newUrl.toString());

                this.$nextTick(() => {
                    this.selectFile(this.activeFile);
                    this.updatePreview();
                });
            } finally {
                this.isLoading = false;
            }
        },
        
        copyShareLink() {
            navigator.clipboard.writeText(window.location.href);
            alert("Link copied to clipboard!");
        },

        savePat() {
            localStorage.setItem('github_pat', this.pat);
            // This will now fetch the user profile and trigger loadUserGists automatically
            this.getAuthenticatedUser(); 
        },

        async loadUserGists(targetUser) {
            this.isLoading = true;
            try {
                this.username = targetUser;
                localStorage.setItem('last_user', targetUser);
                this.view = 'user';
                let url = `https://api.github.com/users/${targetUser}/gists`;
                const headers = this.pat ? { 'Authorization': `Bearer ${this.pat}` } : {};
                const res = await fetch(url, { headers });
                const data = await res.json();
                this.gists = Array.isArray(data) ? data : [];
            } finally {
                this.isLoading = false;
            }
        },

        selectFile(name) {
            // 1. Lock the editor to prevent saving during the switch
            this.isSwitching = true;
            this.activeFile = name;

            const ext = name.split('.').pop();
            const mode = { 'js': 'javascript', 'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown' }[ext] || 'text';
            this.editor.session.setMode(`ace/mode/${mode}`);
            
            const content = this.files[name]?.content || "";
            this.editor.setValue(content, -1); 
            
            this.updatePreview();

            // 2. Unlock after a tiny delay to let the event settle
            setTimeout(() => {
                this.isSwitching = false;
            }, 100);
        },

        updatePreview() {
            const container = document.getElementById('preview-container');
            const ptitle = document.getElementById('preview-title');
            if (!container) return;

            // FIX: Always use the active file's content
            const code = this.files[this.activeFile]?.content || "";

            const oldIframe = document.getElementById('display');
            if (oldIframe) { oldIframe.remove(); }

            const newIframe = document.createElement('iframe');
            newIframe.id = 'display';
            newIframe.style.width = '100%';
            newIframe.style.height = '100%';
            newIframe.style.border = 'none';
            container.appendChild(newIframe);

            const target = newIframe.contentWindow.document;
            target.open();
            target.write(code);
            target.close();

            if (ptitle) ptitle.textContent = this.activeFile;
        },

        async saveFile() {
            if (!this.pat) return alert("Token Required");
            if (!this.currentGistId) return this.createGist();

            this.isLoading = true;
            try {
                const updatedFiles = {};
                updatedFiles[this.activeFile] = { content: this.files[this.activeFile].content };
                const res = await fetch(`https://api.github.com/gists/${this.currentGistId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${this.pat}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: updatedFiles })
                });
                if (res.ok) alert("Saved!");
                else alert("Save failed.");
            } finally {
                this.isLoading = false;
            }
        },
        
        addFile() {
            const fileName = prompt("Enter new filename (e.g., style.css):");
            if (!fileName) return;

            if (this.files[fileName]) {
                alert("File already exists!");
                return;
            }

            // 1. Add file to the object
            this.files[fileName] = { content: "" };

            // 2. Use $nextTick to ensure Alpine has rendered the new sidebar item
            this.$nextTick(() => {
                this.selectFile(fileName);
            });
        },

        startNewGist() {
            this.currentGistId = null; // Null indicates this is a new, unsaved Gist
            this.isPublic = false; // Default for new, unsaved gists
            this.files = {
                'index.html': { content: '\n<h1>Hello World</h1>' }
            };
            this.activeFile = 'index.html';
            this.view = 'playground';
            
            // Reset editor
            this.editor.setValue(this.files['index.html'].content, -1);
            this.updatePreview();
        },

        async createGist() {
            if (!this.pat) return alert("Token Required");
            const description = prompt("Enter a description:", "Created via Gist Playground");
            const isPublic = confirm("Make this Gist PUBLIC?");
            
            this.isLoading = true;
            try {
                const res = await fetch(`https://api.github.com/gists`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.pat}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description, public: isPublic, files: this.files })
                });
                if (res.ok) {
                    const data = await res.json();
                    this.currentGistId = data.id;
                    this.openGist(data.id);
                }
            } finally {
                this.isLoading = false;
            }
        },

        async deleteFile(name) {
            if (!confirm(`Are you sure you want to delete ${name}?`)) return;

            // 1. Remove locally
            delete this.files[name];

            // 2. If it's an existing Gist, update GitHub
            if (this.currentGistId) {
                const body = { files: { [name]: null } }; // Setting to null deletes the file
                const res = await fetch(`https://api.github.com/gists/${this.currentGistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.pat}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (!res.ok) {
                    alert("Failed to delete file from GitHub.");
                    // Optionally reload to restore the file locally
                    return;
                }
            }

            // 3. Update active file state
            if (this.activeFile === name) {
                const remainingFiles = Object.keys(this.files);
                this.activeFile = remainingFiles.length > 0 ? remainingFiles[0] : '';
                
                if (this.activeFile) {
                    this.selectFile(this.activeFile);
                } else {
                    this.editor.setValue('', -1);
                    this.updatePreview();
                }
            }
        }
    }));
});
