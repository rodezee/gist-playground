document.addEventListener('alpine:init', () => {
    Alpine.data('gistPlayground', () => ({
        // Initialize defaults so Alpine doesn't throw "undefined" errors
        view: 'home', 
        username: '',
        gists: [],
        files: {},
        activeFile: '',
        loading: false,

        async init() {
            const params = new URLSearchParams(window.location.search);
            const user = params.get('user');
            const id = params.get('id');

            if (id) {
                this.view = 'playground';
                await this.loadGist(id);
            } else if (user) {
                this.view = 'list';
                this.username = user;
                await this.loadUserGists(user);
            } else {
                this.view = 'home';
            }
        },

        async loadUserGists(user) {
            this.loading = true;
            try {
                const res = await fetch(`https://api.github.com/users/${user}/gists`);
                this.gists = await res.json();
            } catch (e) {
                console.error("Failed to load user gists", e);
            } finally {
                this.loading = false;
            }
        },

        async loadGist(id) {
            if (!id) return;
            try {
                const res = await fetch(`https://api.github.com/gists/${id}`);
                const data = await res.json();
                
                // Format files into a usable object
                this.files = data.files;
                this.activeFile = Object.keys(data.files)[0];
                
                this.$nextTick(() => {
                    this.renderOutput();
                    Prism.highlightAll();
                });
            } catch (e) {
                console.error("Failed to load gist", e);
            }
        },

        selectFile(name) {
            this.activeFile = name;
            this.$nextTick(() => {
                Prism.highlightAll();
                this.renderOutput();
            });
        },

        getExt() {
            return this.activeFile ? this.activeFile.split('.').pop() : 'markup';
        },

        renderOutput() {
            if (!this.$refs.outputFrame || !this.activeFile) return;
            
            const file = this.files[this.activeFile];
            // If it's HTML, render it. If not, maybe wrap it in basic HTML tags
            let content = file.content;
            if (this.getExt() !== 'html') {
                content = `<html><body><pre>${content}</pre></body></html>`;
            }

            const blob = new Blob([content], { type: 'text/html' });
            this.$refs.outputFrame.src = URL.createObjectURL(blob);
        }
    }));
});
