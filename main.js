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
  userAgent(raw) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent#which_part_of_the_user_agent_contains_the_information_you_are_looking_for
    const userAgents = ['Seamonkey','Firefox','Chromium','Edg.*', 'Chrome', 'Safari', 'OPR', 'Opera'];
    for (let index = 0; index < userAgents.length; index+=1) {
      const userAgent = userAgents[index];
      const result =  new RegExp(`(${userAgent}\\/\\d+\\.\\d+)`, 'iu').exec(raw);
      if (result) {
        return result[0];
      }
    }
    return 'Unknown'
  },
  prettyBytes(byteCount) {
    let size = byteCount / 1000;
    if (size < 1000) {
      return `${size.toFixed(2)} KB`;
    }
    size /= 1000;
    if (size < 1000) {
      return `${size.toFixed(2)} MB`;
    }
    size /= 1000;
    return `${size.toFixed(2)} GB`;
  },

  prettyTime(deltaMillisecond) {
    let time = deltaMillisecond / 1000;
    if (time <= 1) {
      return `<1s`;
    }
    if (time < 60) {
      return `${Math.floor(time).toFixed(0).padStart(2, '0')}s`;
    }
    time /= 60;
    if (time < 60) {
      return `${Math.floor(time).toFixed(0).padStart(2, '0')}m${((time * 60) % 60).toFixed(0).padStart(2, '0')}s`;
    }
    time /= 60;
    return `${Math.floor(time).toFixed(0).padStart(2, '0')}h${((time * 60) % 60).toFixed(0).padStart(2, '0')}m`;
  },
};

const MESSAGE_TYPE = {
  ServerInfo: "server-info",
  ServerChunk: "server-chunk",
  ServerDone: "server-done",
  ClientInfo: "client-info",
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

      isServer: true,
      server: {
        clients: [],
        url: null,
        data: null, // TODO multiple files
        copied: false,
      },
      client: {
        remoteId: null,
        connection: null,
        connected: false,
        downloadStart: null,
        downloadEnd: null,
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
    readyToDownload() {
      return this.client.buffer !== null && !this.client.downloadStart;
    },
    serverIsReady() {
      return this.canConnect && this.server.data !== null;
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
    shareText() {
      if (navigator.canShare && navigator.canShare()) {
        return "Share link";
      }
      if (this.server.copied) {
        return "Copied to clipboard";
      }
      return "Copy link";
    },
    statusText() {
      if (this.error) {
        return this.error;
      }
      if (!this.canConnect) {
        return 'Acquiring ID...';
      }
      if (this.isServer) {
        if (! this.server.data) {
          return 'Waiting for file upload';
        }
        return 'Ready to send file';
      }
      if (! this.client.connected) {
        return 'Connecting to peer...';
      }
      if (this.readyToDownload) {
        return 'Ready to download';
      }
      if (! this.downloading) {
        return 'Waiting for file info...';
      }
      if (this.client.downloadEnd) {
        return 'File downloaded';
      }
      return 'Downloading...';
    },
    prettyFileSize() {
      return utils.prettyBytes(this.fileSize);
    },
    prettyDownloadSpeed() {
      if (! this.client.downloadStart) {
        return '';
      }
      const time = (this.client.downloadEnd ?? (new Date())) - this.client.downloadStart;
      const speed = 1000 * this.downloadProgress / time;
      return `${utils.prettyBytes(speed)}/s`;
    },
    prettyRemainingTime() {
      if (! this.client.downloadStart || this.client.downloadEnd) {
        return '';
      }
      const time = (this.client.downloadEnd ?? (new Date())) - this.client.downloadStart;
      const speed = this.downloadProgress / time;
      const remainingBytes = this.downloadTotal - this.downloadProgress;
      const remainingTime = remainingBytes / speed;
      return `${utils.prettyTime(remainingTime)}`;
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
            { url: 'stun:stun.l.google.com:19302' },
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
    initServerConnection(conn) {
      const index = this.server.clients.length;
      this.server.clients.push({
        connection: conn,
        id: conn.peer,
        done: false,
        sent: 0,
        connected: false,
        status: 'Connecting...',
        userAgent: null,
      });
      conn.on("open", () => this.onServerConnectionOpen(index));
      conn.on("close", () => this.onServerConnectionClose(index));
      conn.on("data", (data) => this.onServerConnectionData(index, data));
      conn.on("error", (err) => this.onServerConnectionError(index, err));
    },
    initClientConnection(conn) {
      this.client.connection = conn;
      conn.on("open", this.onClientConnectionOpen);
      conn.on("close", this.onClientConnectionClose);
      conn.on("data", this.onClientConnectionData);
      conn.on("error", this.onClientConnectionError);
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
    clientOpenConnection() {
      this.initClientConnection(
        this.peer.connect(this.client.remoteId, { reliable: false }),
      );
    },
    // PEER EVENTS
    onPeerOpen(id) {
      console.log("onPeerOpen", id);
      this.localId = id;
      this.error = null;
      if (this.isServer) {
        this.server.url = `${window.location.href}?s=${id}`;
      } else {
        this.clientOpenConnection();
      }
    },
    onPeerConnection(conn) {
      console.log("onPeerConnection", conn);
      if (this.isServer) {
        this.initServerConnection(conn);
      }
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
    // SERVER CONNECTION EVENTS
    onServerConnectionOpen(index) {
      console.log("onServerConnectionOpen", index);
      this.server.clients[index].connected = true;
      this.server.clients[index].status = 'Connected';
      this.sendServerInfo(index);
    },
    onServerConnectionData(index, data) {
      console.log("onServerConnectionData", index, data.type);
      switch (data.type) {
        case MESSAGE_TYPE.ClientInfo:
          this.handleClientInfo(index, data);
          break;
        case MESSAGE_TYPE.ClientSeek:
          this.handleClientSeek(index, data);
          break;
        case MESSAGE_TYPE.ClientDone:
          this.handleClientDone(index, data);
          break;
        default:
          console.error("Invalid message type");
          break;
      }
    },
    onServerConnectionClose(index) {
      console.log("onServerConnectionClose", index);
      this.server.clients[index].status = 'Disconnected';
    },
    onServerConnectionError(index, err) {
      console.log("onServerConnectionError", index, err);
      this.server.clients[index].status = 'Error';
    },
    // CLIENT CONNECTION EVENTS
    onClientConnectionOpen() {
      console.log("onClientConnectionOpen");
      this.client.connected = true;
      this.sendClientInfo();
    },
    onClientConnectionData(data) {
      console.log("onClientConnectionData", data.type);
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
        default:
          console.error("Invalid message type");
          break;
      }
    },
    onClientConnectionClose() {
      console.log("onClientConnectionClose");
      this.client.connection = null;
    },
    onClientConnectionError(err) {
      console.log("onClientConnectionError", err);
      this.error = `Connection failed: ${err.type}. Reconnecting...`
      setTimeout(this.clientOpenConnection, 1000);
    },
    // EXCHANGES
    sendServerInfo(index) {
      this.server.clients[index].connection.send({
        type: MESSAGE_TYPE.ServerInfo,
        fileName: this.fileName,
        fileSize: this.fileSize,
      });
    },
    handleServerInfo(data) {
      this.fileName = data.fileName;
      this.fileSize = data.fileSize;
      this.clientCreateStream();
    },
    sendServerChunk(index, chunkIndex) {
      this.server.clients[index].connection.send({
        type: MESSAGE_TYPE.ServerChunk,
        index: chunkIndex,
        bytes: this.server.data.slice(chunkIndex, chunkIndex + MAX_CHUNK_SIZE),
      });
      this.server.clients[index].sent += MAX_CHUNK_SIZE;
    },
    handleServerChunk(data) {
      new Uint8Array(this.client.buffer).set(
        new Uint8Array(data.bytes),
        data.index,
      );
      this.client.received.push(data.index);
    },
    sendServerDone(index) {
      this.server.clients[index].connection.send({
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
        this.client.downloadEnd = new Date();
        this.sendClientDone();
        this.clientDownloadFile();
      }
    },
    sendClientInfo() {
      this.client.connection.send({
        type: MESSAGE_TYPE.ClientInfo,
        userAgent: navigator.userAgent,
      });
    },
    handleClientInfo(index, data) {
      this.server.clients[index].userAgent = utils.userAgent(data.userAgent);
    },
    sendClientSeek(indexes = null) {
      this.client.connection.send({
        type: MESSAGE_TYPE.ClientSeek,
        indexes,
      });
    },
    handleClientSeek(index, data) {
      if (data.indexes) {
        data.indexes.forEach((chunkIndex) => {
          setTimeout(() => this.sendServerChunk(index, chunkIndex));
        });
      } else {
        for (let chunkIndex = 0; chunkIndex < this.fileSize; chunkIndex += MAX_CHUNK_SIZE) {
          setTimeout(() => this.sendServerChunk(index, chunkIndex));
        }
      }
      setTimeout(() => this.sendServerDone(index));
    },
    sendClientDone() {
      this.client.connection.send({
        type: MESSAGE_TYPE.ClientDone,
      });
    },
    handleClientDone(index) {
      this.server.clients[index].connection.close();
      this.server.clients[index].done = true;
      this.server.clients[index].status = 'Done';
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
    onShare() {
      if (navigator.canShare && navigator.canShare()) {
        navigator.share({
          url: this.server.url,
          title: window.title,
        })
      } else {
        navigator.clipboard.writeText(this.server.url);
        this.server.copied = true;
        setTimeout(() => {this.server.copied = false;}, 5000);
      }
    }
  },
});

window.onload = () => {
  app.mount("#app");
};
