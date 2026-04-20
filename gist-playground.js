document.addEventListener('alpine:init', () => {
    Alpine.data('gistPlayground', () => ({
        view: 'home',
        searchUser: '',
        username: '',
        gists: [],
        files: {},
        activeFile: '',
        gistId: '',
        user: null,
        githubToken: '',

        init() {
            netlifyIdentity.init();

            // Helper to get username safely
            const getUsername = (user) => {
                const meta = user?.user_metadata || {};
                return meta.user_name || meta.full_name || 'User';
            };

            netlifyIdentity.on('login', (user) => {
                this.user = user;
                this.githubToken = user.token.access_token;
                this.loadUserGists(getUsername(user));
                netlifyIdentity.close();
            });

            netlifyIdentity.on('logout', () => {
                this.user = null;
                this.githubToken = '';
                this.gists = [];
                this.view = 'home';
            });

            const currentUser = netlifyIdentity.currentUser();
            if (currentUser) {
                this.user = currentUser;
                this.githubToken = currentUser.token.access_token;
                this.loadUserGists(getUsername(currentUser));
            }
        },

        async saveFile() {
            if (!this.user) {
                alert("Please log in to save your changes.");
                return;
            }

            try {
                const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${this.githubToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        files: { 
                            [this.activeFile]: { content: this.files[this.activeFile].content } 
                        }
                    })
                });

                if (response.ok) {
                    alert("Saved to GitHub!");
                    this.renderOutput();
                } else {
                    const data = await response.json();
                    alert("Error: " + (data.message || "Could not save."));
                }
            } catch (err) {
                console.error(err);
                alert("Failed to save.");
            }
        },

        highlightCode() {
            // Updated to be safe: it only runs if the element exists
            const codeEl = document.querySelector('main.col-code code');
            if (codeEl && typeof Prism !== 'undefined') {
                delete codeEl.dataset.highlighted; 
                Prism.highlightElement(codeEl);
            }
        },

        initFromUrl() {
            const params = new URLSearchParams(window.location.search);
            if (params.has('id')) {
                this.openGist(params.get('id'));
            } else if (params.has('user')) {
                this.loadUserGists(params.get('user'));
            }
        },

        updateUrl(params) {
            const newUrl = window.location.pathname + '?' + params.toString();
            history.pushState({}, '', newUrl);
        },

        goToUser() {
            if (this.searchUser.trim()) {
                this.loadUserGists(this.searchUser.trim());
                this.searchUser = '';
            }
        },

        async loadUserGists(username) {
            this.username = username;
            this.view = 'user';

            // 1. Determine if we should use Auth
            const isAuth = !!this.githubToken;
            const url = isAuth ? `https://api.github.com/gists` : `https://api.github.com/users/${username}/gists`;

            // 2. Use 'Bearer' instead of 'token'
            const headers = isAuth ? { 'Authorization': `Bearer ${this.githubToken}` } : {};

            try {
                const res = await fetch(url, { headers });
                
                if (res.status === 401) {
                    console.error("Unauthorized! Token might be invalid or expired.");
                    // Optional: Fallback to public if private fails
                    this.loadPublicGists(username);
                    return;
                }

                this.gists = await res.json();
            } catch (e) { 
                console.error("Gist Load Error:", e); 
            }
        },

        // Add this helper to prevent infinite loops
        async loadPublicGists(username) {
            const res = await fetch(`https://api.github.com/users/${username}/gists`);
            this.gists = await res.json();
        },

        async openGist(id) {
            this.view = 'playground';
            this.updateUrl(new URLSearchParams({ id }));
            try {
                const res = await fetch(`https://api.github.com/gists/${id}`);
                const data = await res.json();
                this.files = data.files;
                this.activeFile = Object.keys(data.files)[0];

                this.$nextTick(() => {
                    this.highlightCode();
                    this.renderOutput();
                });
            } catch (e) { console.error("Gist Load Error:", e); }
        },

        selectFile(name) {
            this.activeFile = name;
            this.$nextTick(() => {
                this.highlightCode();
                this.renderOutput();
            });
        },

        getExt() {
            if (!this.activeFile) return 'javascript';
            const parts = this.activeFile.split('.');
            const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
            const map = { 'js': 'javascript', 'html': 'markup', 'htm': 'markup', 'css': 'css' };
            return map[ext] || 'javascript';
        },

        renderOutput() {
            const container = document.getElementById('preview-container');
            const ptitle = this.$refs.outputFrameTitle;
            
            if (!container || !this.activeFile || !this.files[this.activeFile]) return;

            const file = this.files[this.activeFile];
            let code = file.content;

            // Ensure Standards Mode
            if (this.getExt() !== 'markup') {
                code = `<!DOCTYPE html><html><body style="padding:2rem; font-family:monospace;"><pre>${code.replace(/</g, "&lt;")}</pre></body></html>`;
            } else if (!code.trim().toLowerCase().startsWith('<!doctype')) {
                code = '<!DOCTYPE html>\n' + code;
            }

            // 1. Destroy old iframe (Cleans History API stack)
            const oldIframe = document.getElementById('display');
            if (oldIframe) { oldIframe.remove(); }

            // 2. Create New iframe
            const newIframe = document.createElement('iframe');
            newIframe.id = 'display';
            newIframe.style.width = '100%';
            newIframe.style.height = '100%';
            newIframe.style.border = 'none';
            container.appendChild(newIframe);

            // 3. Sync Write (Standard Playground Procedure)
            const win = newIframe.contentWindow;
            const target = win.document;
            target.open();
            target.write(code);
            target.close();

            // 4. Update Preview Header
            const sync = () => {
                if (ptitle) {
                    ptitle.textContent = (target.title || "Preview") + " - " + win.location.pathname;
                }
            };
            sync();

            // 5. Reactive Title Change (For Alpine Turnout navigation)
            win.addEventListener("click", () => setTimeout(sync, 50));
        }
    }));
});
