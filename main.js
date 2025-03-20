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
  makeQrCode(element, text) {
    return new QRCode(element, {
      text,
      width: 1024,
      height: 1024,
      colorDark: "oklch(0.2 0 0)",
      colorLight: "#00000000",
      correctLevel: QRCode.CorrectLevel.L,
    });
  },
  userAgent(raw) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent#which_part_of_the_user_agent_contains_the_information_you_are_looking_for
    const userAgents = [
      "Seamonkey",
      "Firefox",
      "Chromium",
      "Edg.*",
      "Chrome",
      "Safari",
      "OPR",
      "Opera",
    ];
    for (let index = 0; index < userAgents.length; index += 1) {
      const userAgent = userAgents[index];
      const result = new RegExp(`(${userAgent}\\/\\d+\\.\\d+)`, "iu").exec(raw);
      if (result) {
        return result[0];
      }
    }
    return "Unknown";
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
      return `${Math.floor(time).toFixed(0).padStart(2, "0")}s`;
    }
    time /= 60;
    if (time < 60) {
      return `${Math.floor(time).toFixed(0).padStart(2, "0")}m${(
        (time * 60) %
        60
      )
        .toFixed(0)
        .padStart(2, "0")}s`;
    }
    time /= 60;
    return `${Math.floor(time).toFixed(0).padStart(2, "0")}h${((time * 60) % 60)
      .toFixed(0)
      .padStart(2, "0")}m`;
  },
};

const MESSAGE_TYPE = {
  ServerInfo: "server-info",
  ServerChunk: "server-chunk",
  ServerDone: "server-done",
  ClientInfo: "client-info",
  ClientSeek: "client-seek",
  ClientDone: "client-done",
  Ping: "ping",
};

const STATUS = {
  Error: "Error",
  Connecting: "Acquiring ID...",
  ServerNoFile: "Online",
  ServerReading: "Reading file...",
  ServerReady: "Ready to send file",
  ClientConnecting: "Connecting to peer...",
  ClientWaiting: "Waiting for file info...",
  ClientReady: "Ready to download",
  ClientDownloading: "Downloading file...",
  ClientDownloaded: "File downloaded",
  ClientDisconnected: "Disconnected",
};

const STATUS_COLOR = {
  [STATUS.Error]: "error",
  [STATUS.Connecting]: "neutral",
  [STATUS.ServerNoFile]: "info",
  [STATUS.ServerReading]: "warning",
  [STATUS.ServerReady]: "success",
  [STATUS.ClientConnecting]: "info",
  [STATUS.ClientWaiting]: "info",
  [STATUS.ClientReady]: "success",
  [STATUS.ClientDownloading]: "primary",
  [STATUS.ClientDownloaded]: "success",
  [STATUS.ClientDisconnected]: "neutral",
};

const CONNECTED_STATUSES = [
  STATUS.Connecting,
  STATUS.ServerNoFile,
  STATUS.ServerReady,
  STATUS.ClientConnecting,
  STATUS.ClientWaiting,
  STATUS.ClientReady,
];

const PEER_ERROR = {
  /**
   * The client's browser does not support some or all WebRTC features that you are trying to use.
   */
  BrowserIncompatible: "browser-incompatible",
  /**
   * You've already disconnected this peer from the server and can no longer make any new connections on it.
   */
  Disconnected: "disconnected",
  /**
   * The ID passed into the Peer constructor contains illegal characters.
   */
  InvalidID: "invalid-id",
  /**
   * The API key passed into the Peer constructor contains illegal characters or is not in the system (cloud server only).
   */
  InvalidKey: "invalid-key",
  /**
   * Lost or cannot establish a connection to the signalling server.
   */
  Network: "network",
  /**
   * The peer you're trying to connect to does not exist.
   */
  PeerUnavailable: "peer-unavailable",
  /**
   * PeerJS is being used securely, but the cloud server does not support SSL. Use a custom PeerServer.
   */
  SslUnavailable: "ssl-unavailable",
  /**
   * Unable to reach the server.
   */
  ServerError: "server-error",
  /**
   * An error from the underlying socket.
   */
  SocketError: "socket-error",
  /**
   * The underlying socket closed unexpectedly.
   */
  SocketClosed: "socket-closed",
  /**
   * The ID passed into the Peer constructor is already taken.
   *
   * :::caution
   * This error is not fatal if your peer has open peer-to-peer connections.
   * This can happen if you attempt to {@apilink Peer.reconnect} a peer that has been disconnected from the server,
   * but its old ID has now been taken.
   * :::
   */
  UnavailableID: "unavailable-id",
  /**
   * Native WebRTC errors.
   */
  WebRTC: "webrtc",
};

const MAX_CHUNK_SIZE = 12 * 1024;
const MAX_DELAY_PING = 5000;

const app = createApp({
  data() {
    return {
      peer: null,
      fileName: null,
      fileSize: null,
      localId: null,
      error: null,

      isServer: true,
      server: {
        clients: [],
        url: null,
        reading: false,
        data: null,
        copied: false,
      },
      client: {
        remoteId: null,
        connection: null,
        connected: false,
        downloadStart: null,
        downloadEnd: null,
        received: [],
        buffer: null,
        lastMessage: null,
      },
    };
  },
  computed: {
    canConnect() {
      return this.peer !== null && this.localId !== null;
    },
    serverIsReady() {
      return (
        this.error === null && this.canConnect && this.server.data !== null
      );
    },
    serverCanUpload() {
      return (
        this.error === null && this.server.data === null && !this.server.reading
      );
    },
    serverShareText() {
      if (navigator.canShare && navigator.canShare()) {
        return "Share link";
      }
      if (this.server.copied) {
        return "Copied to clipboard";
      }
      return "Copy link";
    },
    clientIsReady() {
      return (
        this.error === null &&
        this.canConnect &&
        this.client.connection !== null &&
        this.client.buffer !== null &&
        this.client.downloadStart === null
      );
    },
    clientDownloading() {
      return (
        this.client.downloadStart !== null && this.client.downloadEnd === null
      );
    },
    clientDownloadProgress() {
      return this.client.received.length * MAX_CHUNK_SIZE;
    },
    clientFinished() {
      return this.client.downloadEnd !== null;
    },
    status() {
      if (this.error) return STATUS.Error;
      if (!this.canConnect) return STATUS.Connecting;
      return this.isServer ? this.serverStatus : this.clientStatus;
    },
    serverStatus() {
      if (this.server.reading) return STATUS.ServerReading;
      if (!this.server.data) return STATUS.ServerNoFile;
      return STATUS.ServerReady;
    },
    clientStatus() {
      if (!this.client.connected) return STATUS.ClientConnecting;
      if (!this.client.connection) return STATUS.ClientDisconnected;
      if (this.client.downloadEnd) return STATUS.ClientDownloaded;
      if (this.clientIsReady) return STATUS.ClientReady;
      if (!this.clientDownloading) return STATUS.ClientWaiting;
      return STATUS.ClientDownloading;
    },
    prettyFileSize() {
      return utils.prettyBytes(this.fileSize);
    },
    prettyDownloadSpeed() {
      if (!this.client.downloadStart) {
        return "";
      }
      const time =
        (this.client.downloadEnd ?? new Date()) - this.client.downloadStart;
      const speed = (1000 * this.clientDownloadProgress) / time;
      return `${utils.prettyBytes(speed)}/s`;
    },
    prettyRemainingTime() {
      if (!this.client.downloadStart || this.client.downloadEnd) {
        return "";
      }
      const time =
        (this.client.downloadEnd ?? new Date()) - this.client.downloadStart;
      const speed = this.clientDownloadProgress / time;
      if (speed <= 0) {
        return "Unknown";
      }
      const remainingBytes = this.fileSize - this.clientDownloadProgress;
      const remainingTime = remainingBytes / speed;
      return `${utils.prettyTime(remainingTime)}`;
    },
  },
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
      const remoteId = url.searchParams.get("s") ?? "";
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
      if (uuidRegex.test(remoteId)) {
        this.isServer = false;
        this.client.remoteId = remoteId;
      } else if (remoteId !== "") {
        this.isServer = false;
        this.error = "Invalid link";
      }
    },
    initPeer() {
      this.peer = new Peer({
        debug: window.location.href.includes("localhost") ? 3 : 0,
        host: "peer.klemek.fr",
        port: "443",
        secure: true,
        config: {
          iceServers: [
            {
              urls: ["stun:klemek.fr:3478"],
            },
            {
              urls: ["turns:klemek.fr:5349"],
              username: "anonymous",
              credential: "anonymous",
            },
            {
              urls: ["turn:klemek.fr:3478"],
              username: "anonymous",
              credential: "anonymous",
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
      const index = this.initServerClient(conn);
      conn.on("open", () => this.onServerConnectionOpen(index));
      conn.on("close", () => this.onServerConnectionClose(index));
      conn.on("data", (data) => this.onServerConnectionData(index, data));
      conn.on("error", (err) => this.onServerConnectionError(index, err));
      this.initServerWatch(index);
    },
    initServerClient(conn) {
      let index = this.server.clients.findIndex(
        (client) => client.id === conn.peer
      );
      const clientData = {
        connection: conn,
        id: conn.peer,
        done: false,
        sent: 0,
        connected: false,
        status: STATUS.ClientConnecting,
        userAgent: null,
        lastMessage: new Date(),
      };
      if (index === -1) {
        index = this.server.clients.length;
        this.server.clients.push(clientData);
      } else {
        this.server.clients[index] = clientData;
      }
      return index;
    },
    initServerWatch(index) {
      setInterval(() => {
        if (!this.error && this.server.clients[index].connected) {
          this.sendServerPing(index);
          if (
            new Date() - this.server.clients[index].lastMessage >
            MAX_DELAY_PING
          ) {
            this.onServerConnectionClose(index);
          }
        }
      }, 1000);
    },
    initClientConnection(conn) {
      this.client.connection = conn;
      conn.on("open", this.onClientConnectionOpen);
      conn.on("close", this.onClientConnectionClose);
      conn.on("data", this.onClientConnectionData);
      conn.on("error", this.onClientConnectionError);
      this.initClientWatch();
    },
    initClientWatch() {
      setInterval(() => {
        if (!this.error && this.client.connected) {
          this.sendClientPing();
          if (new Date() - this.client.lastMessage > MAX_DELAY_PING) {
            this.onClientConnectionClose();
          }
        }
      }, 1000);
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
        this.peer.connect(this.client.remoteId, { reliable: false })
      );
    },
    statusColor(status) {
      return STATUS_COLOR[status];
    },
    statusBlinking(status) {
      return CONNECTED_STATUSES.includes(status);
    },
    // PEER EVENTS
    onPeerOpen(id) {
      this.localId = id;
      if (this.isServer) {
        this.server.url = `${window.location.href}?s=${id}`;
        utils.makeQrCode(this.$refs.qrcode, this.server.url);
      } else if (this.error === null) {
        this.clientOpenConnection();
      }
    },
    onPeerConnection(conn) {
      if (this.isServer) {
        this.initServerConnection(conn);
      }
    },
    onPeerClose() {
      // Window shutting down
      this.peer = null;
    },
    onPeerDisconnected() {
      if (this.peer) {
        this.error = `Disconnected.<br>Reconnecting...`;
        this.peer.reconnect();
      }
    },
    onPeerError(err) {
      switch (err.type) {
        case PEER_ERROR.PeerUnavailable:
          if (!this.isServer) {
            this.error = `This link is no longer available`;
          }
          break;
        case PEER_ERROR.SocketClosed:
          if (!this.isServer) {
            this.error = `The remote peer closed the page`;
          }
          break;
        default:
          if (this.peer) {
            this.error = `${err.type}.<br>Reconnecting...`;
            this.peer.reconnect();
          }
          break;
      }
    },
    // SERVER CONNECTION EVENTS
    onServerConnectionOpen(index) {
      this.server.clients[index].connected = true;
      this.server.clients[index].status = STATUS.ClientReady;
      this.sendServerInfo(index);
    },
    onServerConnectionData(index, data) {
      this.server.clients[index].lastMessage = new Date();
      switch (data.type) {
        case MESSAGE_TYPE.Ping:
          break;
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
          this.server.clients[index].status = STATUS.Error;
          break;
      }
    },
    onServerConnectionClose(index) {
      this.server.clients[index].status = STATUS.ClientDisconnected;
      this.server.clients[index].connected = false;
    },
    onServerConnectionError(index) {
      this.server.clients[index].status = STATUS.Error;
      this.server.clients[index].connected = false;
    },
    // CLIENT CONNECTION EVENTS
    onClientConnectionOpen() {
      this.client.connected = true;
      this.sendClientInfo();
    },
    onClientConnectionData(data) {
      this.client.lastMessage = new Date();
      switch (data.type) {
        case MESSAGE_TYPE.Ping:
          break;
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
          this.error = "Invalid message received";
          break;
      }
    },
    onClientConnectionClose() {
      this.client.connection = null;
      if (!this.clientFinished) {
        this.error = `The remote peer closed the page`;
      }
    },
    onClientConnectionError(err) {
      switch (err.type) {
        case PEER_ERROR.PeerUnavailable:
          this.error = `This link is no longer available`;
          break;
        case PEER_ERROR.SocketClosed:
          this.error = `The remote peer closed the page`;
          break;
        default:
          this.error = `${err.type}.<br>Reconnecting...`;
          setTimeout(this.clientOpenConnection);
          break;
      }
    },
    // EXCHANGES
    sendServerPing(index) {
      this.server.clients[index].connection.send({
        type: MESSAGE_TYPE.Ping,
      });
    },
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
        data.index
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
    sendClientPing() {
      this.client.connection.send({
        type: MESSAGE_TYPE.Ping,
      });
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
      this.server.clients[index].status = STATUS.ClientDownloading;
      if (data.indexes) {
        data.indexes.forEach((chunkIndex) => {
          setTimeout(() => this.sendServerChunk(index, chunkIndex));
        });
      } else {
        for (
          let chunkIndex = 0;
          chunkIndex < this.fileSize;
          chunkIndex += MAX_CHUNK_SIZE
        ) {
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
      this.server.clients[index].status = STATUS.ClientDisconnected;
    },
    // FILE READER EVENTS
    onReaderLoad(reader) {
      this.server.data = reader.result;
      this.server.reading = false;
    },
    onReaderError() {
      this.error = "Error reading file";
    },
    // UI EVENTS
    onFileChange(event) {
      const [file] = event.target.files;
      if (file) {
        this.server.reading = true;
        this.fileName = file.name;
        this.fileSize = file.size;
        const reader = new FileReader();
        reader.onload = () => this.onReaderLoad(reader);
        reader.onerror = this.onReaderError;
        reader.readAsArrayBuffer(file);
      }
    },
    onDownload() {
      if (!this.clientIsReady) {
        return;
      }
      this.client.downloadStart = new Date();
      this.client.downloadEnd = null;
      this.sendClientSeek();
    },
    onShare() {
      if (navigator.canShare && navigator.canShare()) {
        navigator.share({
          url: this.server.url,
          title: window.title,
        });
      } else {
        navigator.clipboard.writeText(this.server.url);
        this.server.copied = true;
        setTimeout(() => {
          this.server.copied = false;
        }, 5000);
      }
    },
  },
});

window.onload = () => {
  app.mount("#app");
};
