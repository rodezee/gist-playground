document.addEventListener('alpine:init', () => {
    Alpine.data('gistPlayground', () => ({
        files: {}, // Stores filenames and their raw content
        activeFile: '',
        gistId: new URLSearchParams(window.location.search).get('id'),

        async init() {
            // 1. Fetch Gist Metadata to get filenames and raw_urls
            const res = await fetch(`https://api.github.com/gists/${this.gistId}`);
            const data = await res.json();
            
            // 2. Fetch raw content for each file
            for (let [name, file] of Object.entries(data.files)) {
                const rawRes = await fetch(file.raw_url);
                this.files[name] = await rawRes.text();
                if (!this.activeFile) this.activeFile = name;
            }
            
            this.renderOutput();
        },

        renderOutput() {
            // Combine files into the iframe (assuming HTML/CSS/JS files)
            const iframe = this.$refs.outputFrame;
            const html = this.files['index.html'] || this.files[Object.keys(this.files)[0]];
            
            const blob = new Blob([html], { type: 'text/html' });
            iframe.src = URL.createObjectURL(blob);
        },

        highlight() {
            this.$nextTick(() => Prism.highlightAll());
        }
    }))
})
