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

        init() {
            if (this.searchUser) this.loadUserGists(this.searchUser);
        },

        savePat() {
            localStorage.setItem('github_pat', this.pat);
            if (this.username) this.loadUserGists(this.username);
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

        async openGist(id) {
            this.currentGistId = id;
            const headers = this.pat ? { 'Authorization': `Bearer ${this.pat}` } : {};
            const res = await fetch(`https://api.github.com/gists/${id}`, { headers });
            const data = await res.json();
            
            this.files = data.files;
            this.activeFile = this.files['index.html'] ? 'index.html' : Object.keys(this.files)[0];
            this.view = 'playground';
            this.$nextTick(() => this.updatePreview());
        },

        selectFile(name) {
            this.activeFile = name;
            this.updatePreview();
        },

        /**
         * THE CLEAN PREVIEW UPDATE
         * Matches turnout-playground.netlify.app logic
         */
        updatePreview() {
            const container = document.getElementById('preview-container');
            const ptitle = document.getElementById('preview-title');
            if (!container) return;

            // 1. Get the code (index.html takes priority for the root view)
            const code = this.files['index.html'] ? this.files['index.html'].content : this.files[this.activeFile]?.content;

            // 2. Nuke old iframe
            const oldIframe = document.getElementById('display');
            if (oldIframe) { oldIframe.remove(); }

            // 3. Create fresh iframe
            const newIframe = document.createElement('iframe');
            newIframe.id = 'display';
            newIframe.style.width = '100%';
            newIframe.style.height = '100%';
            newIframe.style.border = 'none';
            container.appendChild(newIframe);

            // 4. document.write logic
            const target = newIframe.contentWindow.document;
            target.open();
            target.write(code);
            target.close();

            // 5. Update Preview Header (Title & Path)
            const updateMeta = () => {
                const docTitle = newIframe.contentWindow.document.title || "Untitled";
                const path = newIframe.contentWindow.location.pathname;
                if (ptitle) ptitle.textContent = `${docTitle} - ${path}`;
            };

            // Initial set
            updateMeta();

            // Click listener for internal SPA routing changes
            newIframe.contentWindow.addEventListener("click", () => {
                setTimeout(updateMeta, 10);
            });
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
