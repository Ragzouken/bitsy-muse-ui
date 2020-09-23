async function start() {
    const source = document.getElementById("bitsymuse").innerHTML;

    const bitsyInput = /** @type {HTMLInputElement} */ (document.getElementById("bitsy"));
    const audioInput = /** @type {HTMLInputElement} */ (document.getElementById("audio"));
    const exportHtmlButton = document.getElementById("export-html");
    const exportZipButton = document.getElementById("export-zip");
    
    const audiosContainer = document.getElementById("audios");
    const roomsContainer = document.getElementById("rooms");

    let rooms = {};
    const hackOptions = {
        audio: {},
        musicByRoom: {},
        silenceId: "@@SILENCE@@",
        resume: false,
    };

    async function exportHTML() {
        const bitsyFile = bitsyInput.files[0];
        saveAs(await getHTMLBlob(bitsyFile), bitsyFile.name);
    }

    async function exportZip() {
        const bitsyFile = bitsyInput.files[0];
        const name = bitsyFile.name.replace(/\.html$/, "");
        const zip = JSZip();
        const folder = zip.folder(name);
    
        async function addAudio(file) {
            folder.file(file.name, await fileToBlob(file));
        }

        folder.file("index.html", await getHTMLBlob(bitsyFile));
        await Promise.all(Array.from(audioInput.files).map(addAudio));
    
        const content = await zip.generateAsync({type: "blob"});
        saveAs(content, `${name}.zip`);
    }

    async function getHTMLBlob(bitsyFile) {
        const bitsyHTML = await textFromFile(bitsyFile).then(text => {
            const test = html("html", {});
            test.innerHTML = text;
            return test;
        });
        const finalSource = source.replace("var hackOptions = {};", `var hackOptions = ${JSON.stringify(hackOptions)}`);
        const script = html("script", { id: "bitsymuse" }, finalSource);

        bitsyHTML.querySelector("head").appendChild(script);

        const blob = new Blob([`<html>${bitsyHTML.innerHTML}</html>`], {type: "text/html"});
        return blob;
    }

    exportHtmlButton.addEventListener("click", exportHTML);
    exportZipButton.addEventListener("click", exportZip);

    bitsyInput.addEventListener("change", async () => {
        const bitsyHTML = await textFromFile(bitsyInput.files[0]).then(htmlFromText);
        const bitsyData = bitsyHTML.getElementById("exportedGameData").innerHTML;
        rooms = findBitsyRoomNames(bitsyData);
        refresh();
    });

    audioInput.addEventListener("change", refresh);

    function refresh() {
        const audioIds = Array.from(audioInput.files).map((file) => file.name);

        // remove audio with no corresponding file
        Object.keys(hackOptions.audio).forEach((audioId) => {
            if (!audioIds.includes(audioId)) {
                delete hackOptions.audio[audioId];
            }
        });

        // add settings for new audio files
        audioIds.forEach((audioId) => {
            if (!hackOptions.audio[audioId]) {
                hackOptions.audio[audioId] = { src: audioId, volume: 1, loop: true };
            }
        })

        // audio setting interface
        audiosContainer.innerHTML = "";
        Object.entries(hackOptions.audio).forEach(([audioId, settings]) => {
            const volume = html("input", { type: "range", min: "0", max: "1", step: "0.1", value: settings.volume });
            volume.addEventListener("input", () => {
                hackOptions.audio[audioId].volume = parseFloat(volume.value);
            });

            const loop = html("input", { type: "checkbox", checked: settings.loop });
            loop.addEventListener("input", () => {
                hackOptions.audio[audioId].loop = loop.checked;
            });

            const row = html(
                "div", { class: "audio-row" },
                html("span", {}, audioId),
                volume,
                loop,
            );

            audiosContainer.appendChild(row);
        });

        // room settings interface
        roomsContainer.innerHTML = "";
        Object.entries(rooms).forEach(([, room]) => {
            const audioSelect = html(
                "select", { value: hackOptions.musicByRoom[room.id] || "false" },
                html("option", { value: false }, "[no change]"),
                html("option", { value: hackOptions.silenceId }, "[stop music]"),
                ...audioIds.map((audioId) => html("option", { value: audioId }, audioId)),
            );

            audioSelect.addEventListener("input", () => {
                const audioId = audioSelect.selectedOptions[0].value;
                if (audioId !== "false") {
                    hackOptions.musicByRoom[room.id] = audioId;
                } else {
                    delete hackOptions.musicByRoom[room.id];
                }
            });

            const row = html(
                "div", { class: "room-row" },
                html("div", {}, `${room.name} (${room.id})`),
                audioSelect,
            );

            roomsContainer.appendChild(row);
        });
    }
}

/**
 * @param {string} gamedata 
 */
function findBitsyRoomNames(gamedata) {
    const lines = gamedata.split("\n");
    const rooms = {};
    let room = undefined;

    function endRoom() {
        if (!room) return;
        rooms[room.id] = room;
        room = undefined;
    }

    lines.forEach((line) => {
        if (line.startsWith("ROOM ")) {
            room = { id: line.slice(5) };
        } else if (line.startsWith("NAME ") && room) {
            room.name = line.slice(5);
        } else if (line.trim().length === 0) {
            endRoom();
        }
    });

    endRoom();

    return rooms;
}

/**
 * @param {File} file 
 * @return {Promise<string>}
 */
async function textFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.readAsText(file); 
    });
}

/**
 * @param {string} source
 */
async function htmlFromText(source) {
    const template = document.createElement('template');
    template.innerHTML = source;
    return template.content;
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tagName 
 * @param {*} attributes 
 * @param  {...(Node | string)} children 
 * @returns {HTMLElementTagNameMap[K]}
 */
function html(tagName, attributes = {}, ...children) {
    const element = /** @type {HTMLElementTagNameMap[K]} */ (document.createElement(tagName)); 
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    children.forEach((child) => element.append(child));
    return element;
}

/**
 * @param {File} file 
 * @returns {Promise<Blob>}
 */
async function fileToBlob(file) {
    const reader = new FileReader();
    const promise = new Promise(resolve => {
        reader.onloadend = () => {
            const data = reader.result;
            const blob = new Blob([data], {type: file.type});
            resolve(blob);
        };
    });
    reader.readAsArrayBuffer(file);
    return promise;
}
