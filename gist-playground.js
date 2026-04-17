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
        },

        initFromUrl() {
            const params = new URLSearchParams(window.location.search);
            if (params.has('id')) {
                this.openGist(params.get('id'));
            } else if (params.has('user')) {
                this.loadUserGists(params.get('user'));
            }
            window.onpopstate = () => this.initFromUrl();
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

                // Wait for Alpine to draw the iframe, then render
                this.$nextTick(() => {
                    this.highlightCode();
                    setTimeout(() => this.renderOutput(), 50);
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
                codeEl.removeAttribute('data-highlighted');
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
            const frame = this.$refs.outputFrame;
            if (!frame || !this.activeFile || !this.files[this.activeFile]) return;

            const file = this.files[this.activeFile];
            let content = file.content;

            // 1. PREPARE CONTENT
            if (this.getExt() === 'markup') {
                // leave it as is
            } else {
                content = `<!DOCTYPE html><html><body><pre>${content.replace(/</g, "&lt;")}</pre></body></html>`;
            }

            // 2. THE HARD RESET
            // Re-pointing the src to about:blank kills any running Alpine/Turnout instances
            // so they don't conflict with the new file.
            frame.src = "about:blank";

            // Wait for the 'blank' to register, then write the new content
            frame.onload = () => {
                // Remove the listener so it doesn't fire again on our write
                frame.onload = null;
                const doc = frame.contentWindow.document;
                doc.open();
                doc.write(content);
                doc.close();
                frame.contentWindow.addEventListener('click', () => {
                    if (this.$refs.outputFrameTitle) {
                        // Update the <small> tag in the header
                        this.$refs.outputFrameTitle.textContent = (doc.title || "Preview") + " - " + frame.contentWindow.location.pathname;
                    }
                });
            };
        }
    }));
});
