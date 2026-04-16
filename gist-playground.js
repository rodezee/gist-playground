document.addEventListener('alpine:init', () => {
    Alpine.data('gistPlayground', () => ({
        view: 'home', // 'home', 'user', 'playground'
        searchUser: '',
        username: '',
        gists: [],
        files: {},
        activeFile: '',

        initFromUrl() {
            const params = new URLSearchParams(window.location.search);
            if (params.has('id')) {
                this.openGist(params.get('id'));
            } else if (params.has('user')) {
                this.loadUserGists(params.get('user'));
            }
            
            // Handle browser back/forward buttons
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
            } catch (e) { console.error(e); }
        },

        updateUI() {
            this.renderOutput();
            const codeEl = document.querySelector('main.col-code code');
            if (codeEl) {
                codeEl.removeAttribute('data-highlighted');
                Prism.highlightElement(codeEl);
            }
        },

        selectFile(name) {
            this.activeFile = name;
            this.$nextTick(() => this.updateUI());
        },

        getExt() {
            if (!this.activeFile) return 'javascript';
            const ext = this.activeFile.split('.').pop();
            const map = { 'js': 'javascript', 'html': 'markup', 'css': 'css' };
            return map[ext] || 'javascript';
        },

        async openGist(id) {
            this.view = 'playground';
            // Update URL without a full page reload
            const params = new URLSearchParams({ id });
            const newUrl = window.location.pathname + '?' + params.toString();
            history.pushState({ id }, '', newUrl);

            try {
                const res = await fetch(`https://api.github.com/gists/${id}`);
                const data = await res.json();
                this.files = data.files;
                
                // Pick the first file
                const firstFile = Object.keys(data.files)[0];
                this.activeFile = firstFile;

                // Give Alpine time to render the <template x-if>
                this.$nextTick(() => {
                    this.updateUI();
                });
            } catch (e) { console.error("Gist Load Error:", e); }
        },

        renderOutput() {
            // 1. Ensure the iframe is actually in the DOM
            if (!this.$refs.outputFrame) {
                // If not ready, retry in a moment
                setTimeout(() => this.renderOutput(), 50);
                return;
            }

            const file = this.files[this.activeFile];
            if (!file) return;

            let content = file.content;
            const isHtml = this.getExt() === 'markup' || this.activeFile.endsWith('.html');

            if (isHtml) {
                // If the Gist uses Alpine Turnout, we want to make sure it 
                // doesn't think it's at a 404 path immediately.
                // We inject a script to 'silence' the internal router's 404 logic
                const initScript = `
                    <script>
                        // Prevent the internal Turnout from freaking out about parent URL
                        window.addEventListener('load', () => {
                            if (window.Alpine && window.Alpine.store('turnout')) {
                                // Force the internal router to Home so it doesn't 404
                                window.Alpine.store('turnout').path = '/';
                            }
                        });
                    </script>
                `;
                content = content.replace('<head>', '<head>' + initScript);
            } else {
                content = `<html><body style="font-family:sans-serif;padding:2rem;"><pre>${content.replace(/</g, "&lt;")}</pre></body></html>`;
            }

            // 2. The 'Hard' Reset
            // Instead of just writing, we wipe the document to kill old Alpine instances
            const iframeDoc = this.$refs.outputFrame.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(content);
            iframeDoc.close();
        }
    }));
});
