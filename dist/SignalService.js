var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class SignalService {
    /**
     * SignalService
     * @param room the room name to join
     * @param socketUrl the url for socket connection
     * @param peerListener the callback function to receive the data from peers
     */
    constructor() {
        this.PCs = new Map();
        this.DCs = new Map();
        this.RCs = new Map();
        this.remoteMediaStreamTracksMap = new Map();
        this.remoteMediaStreamMap = new Map();
        this.connectionId = "";
        this.apiUrl = "";
        window.onbeforeunload = this.beforeUnload();
    }
    /**
     * Connect initializes socket object and connects
     * @param room the room name to join
     * @param socketUrl the url for socket connection
     * @param apiUrl rest api url
     * @private
     */
    connect(room, socketUrl, apiUrl) {
        this.socket = new WebSocket(socketUrl);
        this.socket.onopen = this.onSocketOpen(room);
        this.socket.onclose = this.onClose();
        this.socket.onerror = this.onError();
        this.apiUrl = apiUrl;
    }
    setPeerListener(peerListener) {
        this.peerListener = peerListener;
    }
    setOnDisconnected(onDisconnected) {
        this.onDisconnected = onDisconnected;
    }
    setLocalStream(localStream) {
        this.localStream = localStream;
    }
    setOnMediaStream(onMediaStream) {
        this.onMediaStream = onMediaStream;
    }
    /**
     * sendMessageOverWebSocket
     * @param data
     */
    sendMessageOverWebSocket(data) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            (_a = this.socket) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(data));
        });
    }
    /**
     * returns self socketId
     */
    getConnectionId() {
        return this.connectionId;
    }
    /**
     * It make us send joining request to room
     * @param room
     * @private
     */
    onSocketOpen(room) {
        return () => __awaiter(this, void 0, void 0, function* () {
            if (this.socket) {
                this.socket.onmessage = this.onMessage();
            }
            yield this.sendMessageOverWebSocket({ action: "join", room: { name: room } });
        });
    }
    /**
     * Process messages coming from WebSocket [socket.onmessage]
     * @private
     */
    onMessage() {
        return (event) => __awaiter(this, void 0, void 0, function* () {
            let message;
            try {
                message = JSON.parse(event.data);
            }
            catch (e) {
                console.log(e);
            }
            if (message && message.offer) {
                yield this.generatePC(message.sender);
                yield this.setOnDataChannel(message.sender);
                yield this.answer(message.offer, message.sender);
            }
            if (message && message.answer) {
                yield this.setDescription(message.answer, message.sender);
            }
            if (message && message.message) {
                console.log(event.data);
            }
            if (message && message.joined) {
                console.log("User joined room with id " + message.joined.id);
            }
            if (message && message.me) {
                this.connectionId = message.me.id;
                yield this.generatePCs(message);
            }
            if (message && message.candidate) {
                this.addIceCandidate(message);
            }
        });
    }
    onClose() {
        return () => {
            console.log('[close] Connection died');
        };
    }
    onError() {
        return (err) => {
            console.log(err.message);
        };
    }
    /**
     * sendBeacon will send the request even the tab closed
     * it will remove our connectionId from room object
     * @private
     */
    beforeUnload() {
        return () => __awaiter(this, void 0, void 0, function* () {
            navigator.sendBeacon(this.apiUrl + "/leave", JSON.stringify({ connectionId: this.connectionId }));
        });
    }
    /**
     * sendMessageOverWebRTC
     * @param msg string msg text
     */
    sendMessageOverWebRTC(msg) {
        this.DCs.forEach(value => {
            if (value.readyState === 'open') {
                value.send(msg);
            }
        });
    }
    generatePC(remoteSocketId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.PCs.get(remoteSocketId)) {
                const configuration = { 'iceServers': this.token.iceServers };
                let RTCPeerConnection = window.RTCPeerConnection;
                let rtcPeerConnection = new RTCPeerConnection(configuration);
                this.PCs.set(remoteSocketId, rtcPeerConnection);
                rtcPeerConnection.onicecandidate = this.onIceCandidate(remoteSocketId);
                rtcPeerConnection.ontrack = this.onTrack(remoteSocketId);
                rtcPeerConnection.onnegotiationneeded = this.onNegotiationNeeded(rtcPeerConnection, remoteSocketId);
                rtcPeerConnection.onconnectionstatechange = this.onConnectionStateChange(rtcPeerConnection, remoteSocketId);
                if (this.localStream) {
                    this.localStream.getTracks().forEach((track) => {
                        rtcPeerConnection.addTrack(track);
                    });
                }
                if (!this.DCs.get(remoteSocketId)) {
                    this.createDataChannel(rtcPeerConnection, remoteSocketId);
                }
            }
        });
    }
    onConnectionStateChange(rtcPeerConnection, sender) {
        return () => __awaiter(this, void 0, void 0, function* () {
            const connectionStatus = rtcPeerConnection.connectionState;
            if (["disconnected", "failed", "closed"].includes(connectionStatus)) {
                this.onDisconnected(sender);
            }
        });
    }
    onTrack(remoteSocketId) {
        return (e) => __awaiter(this, void 0, void 0, function* () {
            let remoteMediaStreamTracks = this.remoteMediaStreamTracksMap.get(remoteSocketId);
            if (remoteMediaStreamTracks && remoteMediaStreamTracks.length > 0) {
                remoteMediaStreamTracks.push(e.track);
                this.remoteMediaStreamTracksMap.set(remoteSocketId, remoteMediaStreamTracks);
            }
            else {
                this.remoteMediaStreamTracksMap.set(remoteSocketId, [e.track]);
            }
            if (remoteMediaStreamTracks && remoteMediaStreamTracks.length >= 2) {
                let mediaStream = new MediaStream();
                for (let mediaStreamTrack of remoteMediaStreamTracks) {
                    mediaStream.addTrack(mediaStreamTrack);
                }
                this.remoteMediaStreamMap.set(remoteSocketId, mediaStream);
                if (this.onMediaStream) {
                    this.onMediaStream(this.remoteMediaStreamMap.get(remoteSocketId), remoteSocketId);
                }
            }
        });
    }
    createDataChannel(rtcPeerConnection, remoteSocketId) {
        let dataChannel = rtcPeerConnection.createDataChannel(`textMessageChannel${remoteSocketId}`);
        dataChannel.onopen = this.onSendChannelStateChange(remoteSocketId);
        dataChannel.onclose = this.onSendChannelStateChange(remoteSocketId);
        this.DCs.set(remoteSocketId, dataChannel);
    }
    onNegotiationNeeded(rtcPeerConnection, remoteSocketId) {
        return () => __awaiter(this, void 0, void 0, function* () {
            console.log("negotiationNeeded");
            yield this.offer(rtcPeerConnection, remoteSocketId);
        });
    }
    onDataChannel(sender) {
        return (event) => __awaiter(this, void 0, void 0, function* () {
            this.RCs.set(sender, event.channel);
            let channel = this.RCs.get(sender);
            if (channel) {
                channel.onmessage = this.onReceiveMessageCallback(sender);
                channel.onopen = this.onReceiveChannelStateChange(sender);
                channel.onclose = this.onReceiveChannelStateChange(sender);
            }
        });
    }
    onReceiveMessageCallback(socketId) {
        return (event) => {
            let data = event.data;
            if (this.peerListener) {
                this.peerListener({ data, socketId });
            }
        };
    }
    onSendChannelStateChange(remoteSocketId) {
        return () => {
            let dataChannel = this.DCs.get(remoteSocketId);
            if (dataChannel) {
                const readyState = dataChannel.readyState;
                console.log('Send channel state is: ' + readyState);
            }
        };
    }
    onReceiveChannelStateChange(remoteSocketId) {
        return () => {
            let peerConnection = this.PCs.get(remoteSocketId);
            let dataChannel = this.DCs.get(remoteSocketId);
            let remoteDataChannel = this.RCs.get(remoteSocketId);
            if (dataChannel && dataChannel.readyState === 'closed') {
                if (dataChannel) {
                    dataChannel.close();
                }
                this.DCs.delete(remoteSocketId);
                if (remoteDataChannel) {
                    remoteDataChannel.close();
                }
                this.RCs.delete(remoteSocketId);
                if (peerConnection) {
                    peerConnection.close();
                }
                this.PCs.delete(remoteSocketId);
            }
            console.log(`Receive channel state is: ${dataChannel === null || dataChannel === void 0 ? void 0 : dataChannel.readyState}`);
        };
    }
    onIceCandidate(to) {
        return (rtcIceCandidate) => __awaiter(this, void 0, void 0, function* () {
            yield this.sendMessageOverWebSocket({
                action: "message", message: {
                    candidate: rtcIceCandidate.candidate,
                    to
                }
            });
        });
    }
    offer(rtcPeerConnection, to) {
        return __awaiter(this, void 0, void 0, function* () {
            if (rtcPeerConnection) {
                yield rtcPeerConnection.createOffer()
                    .then(this.setOfferDescription(rtcPeerConnection, to), this.onCreateSessionDescriptionError()).catch((reason) => {
                    console.log(reason);
                });
            }
        });
    }
    answer(offer, to) {
        return __awaiter(this, void 0, void 0, function* () {
            let rtcPeerConnection = this.PCs.get(to);
            if (rtcPeerConnection) {
                yield rtcPeerConnection.setRemoteDescription(offer);
                yield rtcPeerConnection.createAnswer()
                    .then(this.setAnswerDescription(to), this.onCreateSessionDescriptionError());
            }
        });
    }
    addTracksToPCs() {
        return __awaiter(this, void 0, void 0, function* () {
            this.PCs.forEach((value) => {
                this.localStream.getTracks().forEach((track) => {
                    value.addTrack(track);
                });
            });
        });
    }
    onCreateSessionDescriptionError() {
        return (error) => {
            console.log('Failed to create session description: ' + error.toString());
        };
    }
    setOfferDescription(rtcPeerConnection, remoteSocketId) {
        return (desc) => __awaiter(this, void 0, void 0, function* () {
            yield this.sendMessageOverWebSocket({
                action: "message", message: {
                    offer: {
                        type: desc.type,
                        sdp: desc.sdp
                    },
                    to: remoteSocketId
                }
            });
            if (rtcPeerConnection) {
                yield rtcPeerConnection.setLocalDescription(desc);
            }
        });
    }
    setAnswerDescription(to) {
        return (desc) => __awaiter(this, void 0, void 0, function* () {
            yield this.sendMessageOverWebSocket({
                action: "message", message: {
                    answer: {
                        type: desc.type,
                        sdp: desc.sdp
                    },
                    to
                }
            });
            let peerConnection = this.PCs.get(to);
            if (peerConnection) {
                yield peerConnection.setLocalDescription(desc);
            }
        });
    }
    setOnDataChannel(sender) {
        return __awaiter(this, void 0, void 0, function* () {
            let peerConnection = this.PCs.get(sender);
            if (peerConnection) {
                peerConnection.ondatachannel = this.onDataChannel(sender);
            }
        });
    }
    setDescription(sdp, sender) {
        return __awaiter(this, void 0, void 0, function* () {
            let peerConnection = this.PCs.get(sender);
            if (peerConnection) {
                const rtcSessionDescription = new RTCSessionDescription(sdp);
                yield peerConnection.setRemoteDescription(rtcSessionDescription);
                peerConnection.ondatachannel = this.onDataChannel(sender);
            }
        });
    }
    onAddIceCandidateSuccess() {
        return () => {
            console.log('AddIceCandidate success.');
        };
    }
    onAddIceCandidateError() {
        return (error) => {
            console.log(`Failed to add Ice Candidate: ${error.toString()}`);
        };
    }
    addIceCandidate(message) {
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            let peerConnection = this.PCs.get(message.sender);
            if (peerConnection) {
                yield peerConnection.addIceCandidate(message.candidate).then(this.onAddIceCandidateSuccess(), this.onAddIceCandidateError());
            }
        }), 250);
    }
    generatePCs(message) {
        return __awaiter(this, void 0, void 0, function* () {
            this.token = message.token;
            for (let peer of message.peers) {
                if (message.me && message.me.id !== peer) {
                    yield this.generatePC(peer);
                }
            }
        });
    }
}
