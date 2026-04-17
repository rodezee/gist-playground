document.addEventListener('alpine:init', () => {
    Alpine.data('gistPlayground', () => ({
        view: 'home',
        searchUser: '',
        username: '',
        gists: [],
        files: {},
        activeFile: '',

        init() {
            this.initFromUrl();
            window.onpopstate = () => this.initFromUrl();
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

        async loadUserGists(user) {
            this.username = user;
            this.view = 'user';
            this.updateUrl(new URLSearchParams({ user }));
            try {
                const res = await fetch(`https://api.github.com/users/${user}/gists`);
                this.gists = await res.json();
            } catch (e) { console.error("User Load Error:", e); }
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

        highlightCode() {
            const codeEl = document.querySelector('main.col-code code');
            if (codeEl) {
                // Force Prism to re-highlight
                delete codeEl.dataset.highlighted; 
                Prism.highlightElement(codeEl);
            }
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
