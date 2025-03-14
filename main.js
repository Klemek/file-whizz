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
};

const MAX_CHUNK_SIZE = 1024 * 1024; // 1024 KB

const app = createApp({
  data() {
    return {
      peer: null,
      localId: null,
      remoteId: null,
      connection: null, // TODO multiple connections
      data: null, // TODO multiple file
      fileStream: null,
      fileName: null,
      fileSize: null,
    };
  },
  computed: {},
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
    connect() {
      if (this.remoteId) {
        this.initConnection(
          this.peer.connect(this.remoteId, { reliable: true }),
        );
      }
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
        this.connection = conn;
        this.connection.on("close", this.connClose);
        this.connection.on("error", this.connError);
        this.connection.on("data", this.connData);
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
      // setTimeout(this.initPeer);
    },
    peerDisconnected() {
      console.log("peerDisconnected");
      // this.peer.reconnect();
    },
    peerError(err) {
      console.log("peerError", err);
      // TODO handle error
    },
    connData(data) {
      console.log("connData");
      console.log(data.type);
      switch (data.type) {
        case "start":
          this.fileName = data.fileName;
          this.fileSize = data.fileSize;
          this.fileStream = streamSaver
            .createWriteStream(this.fileName, {
              size: this.fileSize,
            })
            .getWriter();
          break;
        case "chunk":
          if (this.fileStream) {
            this.fileStream.write(new Uint8Array(data.bytes));
          }
          break;
        case "end":
          if (this.fileStream) {
            this.fileStream.close();
          }
          break;
        default:
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
    },
    fileChange(event) {
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
      };
      reader.onerror = (err) => {
        console.error(err);
      };
      reader.onloadstart = () => {
        console.log("reading");
      };
      reader.onloadend = () => {
        console.log("read");
      };
      reader.readAsArrayBuffer(file); // TODO check ArrayBuffer.prototype.maxByteLength
    },
    start() {
      this.connection.send({
        type: "start",
        fileName: this.fileName,
        fileSize: this.fileSize,
      });
      console.log("start");
      for (
        let index = 0;
        index < this.data.byteLength;
        index += MAX_CHUNK_SIZE
      ) {
        console.log("chunk");
        this.connection.send({
          type: "chunk",
          bytes: this.data.slice(
            index * MAX_CHUNK_SIZE,
            Math.min(this.data.byteLength, (index + 1) * MAX_CHUNK_SIZE),
          ),
        });
      }
      console.log("end");
      this.connection.send({
        type: "end",
      });
    },
    initApp() {
      this.initPeer();
    },
  },
});

window.onload = () => {
  app.mount("#app");
};
