import { createApp } from "vue";

const utils = {
  updateIcons() {
    lucide.createIcons({
      nameAttr: "icon",
      attrs: {
        width: "1.1em",
        height: "1.1em",
      },
    });
  },
  bufferCopy(src, startSrc, dst, startDst, size) {
    const viewSrc = new Uint8Array(src, startSrc, size);
    const dstSrc = new Uint8Array(dst, startDst, size);
    dstSrc.set(viewSrc);
  },
};

const MAX_CHUNK_SIZE = 12 * 1024; // 10 KB

const app = createApp({
  data() {
    return {
      peer: null,
      localId: null,
      remoteId: null,
      connection: null, // TODO multiple connections
      data: null, // TODO multiple file
      buffer: null,
      fileName: null,
      fileSize: null,
      t0: new Date(),
      received: [],
      downloading: false,
    };
  },
  computed: {
    canConnect() {
      return this.peer !== null && this.localId !== null;
    },
    isConnected() {
      return this.connection !== null;
    },
    readyToDownload() {
      return this.buffer !== null && !this.downloading;
    },
    isServer() {
      return this.data !== null;
    },
    isClient() {
      return this.isConnected && !this.isServer;
    },
    downloadProgress() {
      return this.received.length * MAX_CHUNK_SIZE;
    },
    downloadTotal() {
      return this.fileSize ?? 0;
    },
  },
  watch: {},
  updated() {
    utils.updateIcons();
  },
  beforeMount() {
    this.initApp();
  },
  mounted() {
    setTimeout(this.showApp);
    utils.updateIcons();
  },
  methods: {
    showApp() {
      document.getElementById("app").setAttribute("style", "");
    },
    initPeer() {
      this.peer = new Peer({
        debug: 3,
        host: "peer.klemek.fr",
        port: "443",
        secure: true,
        config: {
          iceServers: [
            { urls: ["stun:stun.l.google.com:19302"] },
            {
              urls: [`turn:klemek.fr:3478`, `turns:klemek.fr:5349`],
              username: "username",
              credential: "credential",
            },
          ],
        },
      });
      this.peer.on("open", this.peerOpen);
      this.peer.on("connection", this.peerConnection);
      this.peer.on("close", this.peerClose);
      this.peer.on("disconnected", this.peerDisconnected);
      this.peer.on("error", this.peerError);
    },
    initConnection(conn) {
      conn.on("open", () => {
        console.log("connOpen");
        console.log(conn);
        this.connection = conn;
        this.connection.on("close", this.connClose);
        this.connection.on("error", this.connError);
        this.connection.on("data", this.connData);
        this.serverInfo();
      });
    },
    peerOpen(id) {
      console.log("peerOpen", id);
      this.localId = id;
    },
    peerConnection(conn) {
      console.log("peerConnection");
      this.initConnection(conn);
      this.remoteId = conn.peer;
    },
    peerClose() {
      console.log("peerClose");
      this.peer = null;
    },
    peerDisconnected() {
      console.log("peerDisconnected");
      this.peer.reconnect();
    },
    peerError(err) {
      console.log("peerError", err);
      // TODO handle error
      throw err;
    },
    createStream() {
      this.buffer = new ArrayBuffer(this.fileSize);
    },
    serverInfo() {
      this.connection.send({
        type: "server-info",
        fileName: this.data ? this.fileName : null,
        fileSize: this.data ? this.fileSize : null,
      });
    },
    serverSendData(index) {
      const to = Math.min(this.fileSize, index + MAX_CHUNK_SIZE);
      this.connection.send({
        type: "server-chunk",
        index,
        bytes: this.data.slice(index, to),
      });
    },
    serverDone() {
      this.connection.send({
        type: "server-done",
      });
    },
    clientStartTransfer() {
      this.downloading = true;
      this.connection.send({
        type: "client-start-transfer",
      });
    },
    clientSeek() {
      const indexes = [];
      for (let index = 0; index < this.fileSize; index += MAX_CHUNK_SIZE) {
        if (!this.received.includes(index)) {
          indexes.push(index);
        }
      }
      if (indexes.length) {
        this.connection.send({
          type: "client-seek",
          indexes,
        });
        return true;
      }
      return false;
    },
    clientDone() {
      this.connection.send({
        type: "client-done",
      });
      const blob = new Blob(new Uint8Array(this.buffer), {
        type: "application/octet-stream",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = this.fileName;
      link.click();
    },
    connData(data) {
      console.log("connData");
      console.log(data.type);
      switch (data.type) {
        case "server-info":
          this.fileName = data.fileName;
          this.fileSize = data.fileSize;
          if (this.fileName !== null) {
            this.createStream();
          }
          break;
        case "server-chunk":
          utils.bufferCopy(
            data.bytes,
            0,
            this.buffer,
            data.index,
            data.bytes.length,
          );
          this.received.push(data.index);
          break;
        case "server-done":
          if (!this.clientSeek()) {
            this.clientDone();
          }
          break;
        case "client-start-transfer":
          for (let index = 0; index < this.fileSize; index += MAX_CHUNK_SIZE) {
            this.serverSendData(index);
          }
          this.serverDone();
          break;
        case "client-seek":
          data.indexes.forEach(this.serverSendData);
          this.serverDone();
          break;
        case "client-done":
          this.connection.close();
          break;
        default:
          console.error("Invalid data type");
          break;
      }
    },
    connClose() {
      console.log("connClose");
      this.connection = null;
      // TODO handle conn close
    },
    connError(err) {
      console.log("connError", err);
      // TODO handle error
      throw err;
    },
    onRemoteIdChange() {
      if (this.remoteId) {
        this.initConnection(
          this.peer.connect(this.remoteId, { reliable: true }),
        );
      }
    },
    onFileChange(event) {
      console.log(event.target.files[0]);
      const file = event.target.files[0]; // TODO multiple files
      if (!file) {
        return;
      }
      this.fileName = file.name;
      this.fileSize = file.size;
      this.data = null;
      const reader = new FileReader();
      reader.onload = () => {
        this.data = reader.result;
        if (this.isConnected) {
          this.serverInfo();
        }
      };
      reader.onerror = () => {
        // TODO handle file reading error
      };
      reader.readAsArrayBuffer(file); // TODO check ArrayBuffer.prototype.maxByteLength
    },
    initApp() {
      this.initPeer();
    },
  },
});

window.onload = () => {
  app.mount("#app");
};
