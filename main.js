import { createIcons, icons } from "lucide";
import { createApp } from "vue";

const utils = {
  updateIcons() {
    createIcons({
      icons,
      nameAttr: "icon",
      attrs: {
        width: "1.1em",
        height: "1.1em",
      },
    });
  },
  copyToClipboard(str) {
    navigator.clipboard.writeText(str);
  },
};

const MESSAGE_TYPE = {
  ServerInfo: "server-info",
  ServerChunk: "server-chunk",
  ServerDone: "server-done",
  ClientStartTransfer: "client-start-transfer",
  ClientSeek: "client-seek",
  ClientDone: "client-done",
};

const MAX_CHUNK_SIZE = 12 * 1024; // 12 KB

const app = createApp({
  data() {
    return {
      peer: null,
      fileName: null,
      fileSize: null,
      localId: null,

      remoteId: null,
      connection: null, // TODO multiple connections

      // TODO separate vars
      isServer: true,
      server: {
        url: null,
        data: null, // TODO multiple files
      },
      client: {
        remoteId: null,
        downloadStart: null,
        received: [],
        buffer: null, // TODO multiple files
      },
      error: null,
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
      return this.client.buffer !== null && !this.client.downloadStart;
    },
    serverIsReady() {
      return this.server.data !== null;
    },
    downloading() {
      return this.client.downloadStart !== null;
    },
    downloadProgress() {
      return this.client.received.length * MAX_CHUNK_SIZE;
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
    initApp() {
      this.initClient();
      this.initPeer();
    },
    initClient() {
      const url = new URL(window.location);
      const remoteId = url.searchParams.get("s") ?? '';
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
      if (uuidRegex.test(remoteId)) {
        this.isServer = false;
        this.client.remoteId = remoteId;
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
            {
              urls: [`turn:klemek.fr:3478`, `turns:klemek.fr:5349`],
              username: "username",
              credential: "credential",
            },
          ],
        },
      });
      this.peer.on("open", this.onPeerOpen);
      this.peer.on("connection", this.onPeerConnection);
      this.peer.on("close", this.onPeerClose);
      this.peer.on("disconnected", this.onPeerDisconnected);
      this.peer.on("error", this.onPeerError);
    },
    initConnection(conn) {
      this.connection = conn;
      this.connection.on("open", this.onConnectionOpen);
      this.connection.on("close", this.onConnectionClose);
      this.connection.on("data", this.onConnectionData);
      this.connection.on("error", this.onConnectionError);
    },
    clientCreateStream() {
      try {
        this.client.buffer = new ArrayBuffer(this.fileSize);
      } catch {
        this.error = "File is too big";
      }
    },
    clientDownloadFile() {
      const blob = new Blob([new Uint8Array(this.client.buffer)], {
        type: "application/octet-stream",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = this.fileName;
      link.click();
    },
    // PEER EVENTS
    onPeerOpen(id) {
      console.log("onPeerOpen", id);
      this.localId = id;
      this.error = null;
      if (this.isServer) {
        this.server.url = `${window.location.href}?s=${id}`;
      } else {
        this.initConnection(
          this.peer.connect(this.client.remoteId, { reliable: false }),
        );
        this.remoteId = this.client.remoteId;
      }
    },
    onPeerConnection(conn) {
      console.log("onPeerConnection", conn);
      // TODO multiple connections for server
      this.initConnection(conn);
      this.remoteId = conn.peer;
    },
    onPeerClose() {
      console.log("onPeerClose");
      this.peer = null;
    },
    onPeerDisconnected() {
      console.log("onPeerDisconnected");
      this.peer.reconnect();
    },
    onPeerError(err) {
      console.log("onPeerError", err);
      this.error = `Error connecting: ${err.type}. Reconnecting...`;
      this.peer = null;
      setTimeout(this.initPeer, 1000);
    },
    // CONNECTION EVENTS
    onConnectionOpen() {
      console.log("onConnectionOpen");
      if (this.isServer) {
        this.sendServerInfo();
      }
    },
    onConnectionData(data) {
      console.log("onConnectionData", data.type);
      switch (data.type) {
        case MESSAGE_TYPE.ServerInfo:
          this.handleServerInfo(data);
          break;
        case MESSAGE_TYPE.ServerChunk:
          this.handleServerChunk(data);
          break;
        case MESSAGE_TYPE.ServerDone:
          this.handleServerDone(data);
          break;
        case MESSAGE_TYPE.ClientSeek:
          this.handleClientSeek(data);
          break;
        case MESSAGE_TYPE.ClientDone:
          this.handleClientDone(data);
          break;
        default:
          console.error("Invalid message type");
          break;
      }
    },
    onConnectionClose() {
      console.log("onConnectionClose");
      this.connection = null;
      // TODO handle conn close
    },
    onConnectionError(err) {
      console.log("onConnectionError", err);
      // TODO handle error
      throw err;
    },
    // EXCHANGES
    sendServerInfo() {
      this.connection.send({
        type: MESSAGE_TYPE.ServerInfo,
        fileName: this.server.data ? this.fileName : null,
        fileSize: this.server.data ? this.fileSize : null,
      });
    },
    handleServerInfo(data) {
      this.fileName = data.fileName;
      this.fileSize = data.fileSize;
      this.clientCreateStream();
    },
    sendServerChunk(index) {
      this.connection.send({
        type: MESSAGE_TYPE.ServerChunk,
        index,
        bytes: this.server.data.slice(index, index + MAX_CHUNK_SIZE),
      });
    },
    handleServerChunk(data) {
      new Uint8Array(this.client.buffer).set(
        new Uint8Array(data.bytes),
        data.index,
      );
      this.client.received.push(data.index);
    },
    sendServerDone() {
      this.connection.send({
        type: MESSAGE_TYPE.ServerDone,
      });
    },
    handleServerDone() {
      const indexes = [];
      for (let index = 0; index < this.fileSize; index += MAX_CHUNK_SIZE) {
        if (!this.client.received.includes(index)) {
          indexes.push(index);
        }
      }
      if (indexes.length) {
        this.sendClientSeek(indexes);
      } else {
        this.sendClientDone();
        this.clientDownloadFile();
      }
    },
    sendClientSeek(indexes = null) {
      this.connection.send({
        type: MESSAGE_TYPE.ClientSeek,
        indexes,
      });
    },
    handleClientSeek(data) {
      if (data.indexes) {
        data.indexes.forEach((index) => {
          setTimeout(() => this.sendServerChunk(index));
        });
      } else {
        for (let index = 0; index < this.fileSize; index += MAX_CHUNK_SIZE) {
          setTimeout(() => this.sendServerChunk(index));
        }
      }
      setTimeout(this.sendServerDone);
    },
    sendClientDone() {
      this.connection.send({
        type: MESSAGE_TYPE.ClientDone,
      });
    },
    handleClientDone() {
      this.connection.close();
    },
    // UI EVENTS
    onFileChange(event) {
      const [file] = event.target.files; // TODO multiple files
      if (!file) {
        return;
      }
      this.fileName = file.name;
      this.fileSize = file.size;
      this.server.data = null;
      const reader = new FileReader();
      reader.onload = () => {
        this.server.data = reader.result;
      };
      reader.onerror = () => {
        this.error = "Error reading file";
      };
      reader.readAsArrayBuffer(file);
    },
    onDownload() {
      this.client.downloadStart = new Date();
      this.sendClientSeek();
    },
    onCopy() {
      try {
        navigator.share({
          url: this.server.url,
        })
      } catch {
        utils.copyToClipboard(this.server.url);
      }
    }
  },
});

window.onload = () => {
  app.mount("#app");
};
