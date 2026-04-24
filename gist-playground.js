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

        init() {
            // 1. Check for URL params
            const params = new URLSearchParams(window.location.search);
            const user = params.get('user');
            const gistId = params.get('gist');

            // 2. If params exist, load directly
            if (user && gistId) {
                this.searchUser = user;
                this.username = user; // FIX: Ensure username is set
                this.openGist(gistId);
            } else if (this.searchUser) {
                this.loadUserGists(this.searchUser);
            }
            
            // 3. On PAT grab username via authenticated user
            if (this.pat) {
                this.getAuthenticatedUser();
            }
            
            // Initialize Ace
            this.editor = ace.edit("editor");
            this.editor.setTheme("ace/theme/monokai");
            this.editor.setOptions({
                fontSize: "14px",
                showPrintMargin: false,
                wrap: true
            });

            // Listen for changes in Ace
            this.editor.on("change", () => {
                if (this.activeFile && this.files[this.activeFile]) {
                    this.files[this.activeFile].content = this.editor.getValue();
                    clearTimeout(this.previewTimer);
                    this.previewTimer = setTimeout(() => this.updatePreview(), 500);
                }
            });
        },

        async getAuthenticatedUser() {
            if (!this.pat) return;

            try {
                const res = await fetch('https://api.github.com/user', {
                    headers: { 'Authorization': `Bearer ${this.pat}` }
                });

                if (res.ok) {
                    const user = await res.json();
                    this.searchUser = user.login; // Auto-fills the username input
                    this.loadUserGists(user.login); // Loads the gists automatically
                } else {
                    console.error("Failed to fetch user. Check your PAT.");
                }
            } catch (error) {
                console.error("Error fetching user:", error);
            }
        },

        async openGist(id) {
            this.currentGistId = id;
            const headers = this.pat ? { 'Authorization': `Bearer ${this.pat}` } : {};
            const res = await fetch(`https://api.github.com/gists/${id}`, { headers });
            const data = await res.json();
            
            this.files = data.files;
            this.activeFile = this.files['index.html'] ? 'index.html' : Object.keys(this.files)[0];
            this.view = 'playground';

            // Update URL without reloading
            const newUrl = `${window.location.origin}${window.location.pathname}?user=${this.username}&gist=${id}`;
            window.history.replaceState({ path: newUrl }, '', newUrl);

            this.$nextTick(() => {
                this.selectFile(this.activeFile);
                this.updatePreview();
            });
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
            this.username = targetUser;
            localStorage.setItem('last_user', targetUser);
            this.view = 'user';
            let url = `https://api.github.com/users/${targetUser}/gists`;
            const headers = this.pat ? { 'Authorization': `Bearer ${this.pat}` } : {};

            const res = await fetch(url, { headers });
            const data = await res.json();
            this.gists = Array.isArray(data) ? data : [];
        },

        selectFile(name) {
            this.activeFile = name;
            
            // Set mode based on file extension
            const ext = name.split('.').pop();
            const mode = { 'js': 'javascript', 'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown' }[ext] || 'text';
            this.editor.session.setMode(`ace/mode/${mode}`);
            
            // Set content
            this.editor.setValue(this.files[name].content, -1);
            this.updatePreview();
        },

        updatePreview() {
            const container = document.getElementById('preview-container');
            const ptitle = document.getElementById('preview-title');
            if (!container) return;

            const code = this.files['index.html'] ? this.files['index.html'].content : this.files[this.activeFile]?.content;

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
            const updatedFiles = {};
            updatedFiles[this.activeFile] = { content: this.files[this.activeFile].content };

            const res = await fetch(`https://api.github.com/gists/${this.currentGistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.pat}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ files: updatedFiles })
            });
            if (res.ok) alert("Saved!");
        }
    }));
});
