import { Data } from "./model/Data"

export class SignalService {

    private socket?: WebSocket
    private localStream: MediaStream
    private PCs: Map<string, RTCPeerConnection> = new Map()
    private DCs: Map<string, RTCDataChannel> = new Map()
    private RCs: Map<string, RTCDataChannel> = new Map()
    private remoteMediaStreamTracksMap: Map<string, Array<MediaStreamTrack>> = new Map()
    private remoteMediaStreamMap: Map<string, MediaStream> = new Map()
    private token: any
    private peerListener?: Function
    private onMediaStream?: Function
    private connectionId: string = ""
    private apiUrl: string = ""

    /**
     * SignalService
     * @param room the room name to join
     * @param socketUrl the url for socket connection
     * @param peerListener the callback function to receive the data from peers
     */
    constructor() {
        window.onbeforeunload = this.beforeUnload()
    }

    /**
     * Connect initializes socket object and connects
     * @param room the room name to join
     * @param socketUrl the url for socket connection
     * @param apiUrl rest api url
     * @private
     */
    public connect(room: string, socketUrl: string, apiUrl: string) {
        this.socket = new WebSocket(socketUrl)
        this.socket.onopen = this.onSocketOpen(room)
        this.socket.onclose = this.onClose()
        this.socket.onerror = this.onError()
        this.apiUrl = apiUrl
    }

    public setPeerListener(peerListener: Function) {
        this.peerListener = peerListener
    }

    public setLocalStream(localStream: MediaStream) {
        this.localStream = localStream
    }

    public setOnMediaStream(onMediaStream: Function) {
        this.onMediaStream = onMediaStream
    }

    /**
     * sendMessageOverWebSocket
     * @param data
     */
    public async sendMessageOverWebSocket(data: Data) {
        this.socket?.send(JSON.stringify(data))
    }

    /**
     * returns self socketId
     */
    public getConnectionId() {
        return this.connectionId
    }

    /**
     * It make us send joining request to room
     * @param room
     * @private
     */
    private onSocketOpen(room: string) {
        return async () => {
            if (this.socket) {
                this.socket.onmessage = this.onMessage()
            }
            await this.sendMessageOverWebSocket({ action: "join", room: { name: room } })
        }
    }

    /**
     * Process messages coming from WebSocket [socket.onmessage]
     * @private
     */
    private onMessage() {
        return async (event: any) => {
            let message: any

            try {
                message = JSON.parse(event.data)
            } catch (e) {
                console.log(e)
            }

            if (message && message.offer) {
                await this.generatePC(message.sender)
                await this.setOnDataChannel(message.sender)
                await this.answer(message.offer, message.sender)
            }

            if (message && message.answer) {
                await this.setDescription(message.answer, message.sender)
            }

            if (message && message.message) {
                console.log(event.data)
            }

            if (message && message.joined) {
                console.log("User joined room with id " + message.joined.id)
            }

            if (message && message.me) {
                this.connectionId = message.me.id
                await this.generatePCs(message)
            }

            if (message && message.candidate) {
                this.addIceCandidate(message)
            }
        }
    }

    private onClose() {
        return () => {
            console.log('[close] Connection died')
        }
    }

    private onError() {
        return (err: any) => {
            console.log(err.message)
        }
    }

    /**
     * sendBeacon will send the request even the tab closed
     * it will remove our connectionId from room object
     * @private
     */
    private beforeUnload() {
        return async () => {
            navigator.sendBeacon(this.apiUrl + "/leave", JSON.stringify({ connectionId: this.connectionId }))
        }
    }

    /**
     * sendMessageOverWebRTC
     * @param msg string msg text
     */
    public sendMessageOverWebRTC(msg: string) {
        this.DCs.forEach(value => {
            if (value.readyState === 'open') {
                value.send(msg)
            }
        })
    }

    public async generatePC(remoteSocketId: string) {
        if (!this.PCs.get(remoteSocketId)) {
            const configuration = { 'iceServers': this.token.iceServers }
            let RTCPeerConnection = window.RTCPeerConnection
            let rtcPeerConnection = new RTCPeerConnection(configuration)

            this.PCs.set(remoteSocketId, rtcPeerConnection)
            rtcPeerConnection.onicecandidate = this.onIceCandidate(remoteSocketId)
            rtcPeerConnection.ontrack = this.onTrack(remoteSocketId)
            rtcPeerConnection.onnegotiationneeded = this.onNegotiationNeeded(rtcPeerConnection, remoteSocketId)

            if (this.localStream) {
                this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
                    rtcPeerConnection.addTrack(track)
                })
            }

            if (!this.DCs.get(remoteSocketId)) {
                this.createDataChannel(rtcPeerConnection, remoteSocketId)
            }
        }
    }

    private onTrack(remoteSocketId: string) {
        return async (e: RTCTrackEvent) => {
            let remoteMediaStreamTracks = this.remoteMediaStreamTracksMap.get(remoteSocketId)
            if (remoteMediaStreamTracks && remoteMediaStreamTracks.length > 0) {
                remoteMediaStreamTracks.push(e.track)
                this.remoteMediaStreamTracksMap.set(remoteSocketId, remoteMediaStreamTracks)
            } else {
                this.remoteMediaStreamTracksMap.set(remoteSocketId, [e.track])
            }

            if (remoteMediaStreamTracks && remoteMediaStreamTracks.length >= 2) {
                let mediaStream = new MediaStream()
                for (let mediaStreamTrack of remoteMediaStreamTracks) {
                    mediaStream.addTrack(mediaStreamTrack)
                }
                this.remoteMediaStreamMap.set(remoteSocketId, mediaStream)
                if (this.onMediaStream) {
                    this.onMediaStream(this.remoteMediaStreamMap.get(remoteSocketId))
                }
            }
        }
    }

    private createDataChannel(rtcPeerConnection: RTCPeerConnection, remoteSocketId: string) {
        let dataChannel = rtcPeerConnection.createDataChannel(`textMessageChannel${remoteSocketId}`)
        dataChannel.onopen = this.onSendChannelStateChange(remoteSocketId)
        dataChannel.onclose = this.onSendChannelStateChange(remoteSocketId)
        this.DCs.set(remoteSocketId, dataChannel)
    }

    private onNegotiationNeeded(rtcPeerConnection: RTCPeerConnection, remoteSocketId: string) {
        return async () => {
            console.log("negotiationNeeded")
            await this.offer(rtcPeerConnection, remoteSocketId)
        }
    }

    private onDataChannel(sender: string) {
        return async (event: RTCDataChannelEvent) => {
            this.RCs.set(sender, event.channel)
            let channel = this.RCs.get(sender)
            if (channel) {
                channel.onmessage = this.onReceiveMessageCallback(sender)
                channel.onopen = this.onReceiveChannelStateChange(sender)
                channel.onclose = this.onReceiveChannelStateChange(sender)
            }
        }
    }

    private onReceiveMessageCallback(socketId: string) {
        return (event: MessageEvent) => {
            let data = event.data
            if (this.peerListener) {
                this.peerListener({ data, socketId })
            }
        }
    }

    private onSendChannelStateChange(remoteSocketId: string) {
        return () => {
            let dataChannel = this.DCs.get(remoteSocketId)
            if (dataChannel) {
                const readyState = dataChannel.readyState
                console.log('Send channel state is: ' + readyState)
            }
        }
    }

    private onReceiveChannelStateChange(remoteSocketId: string) {
        return () => {
            let peerConnection = this.PCs.get(remoteSocketId)
            let dataChannel = this.DCs.get(remoteSocketId)
            let remoteDataChannel = this.RCs.get(remoteSocketId)
            if (dataChannel && dataChannel.readyState === 'closed') {
                if (dataChannel) {
                    dataChannel.close()
                }
                this.DCs.delete(remoteSocketId)
                if (remoteDataChannel) {
                    remoteDataChannel.close()
                }
                this.RCs.delete(remoteSocketId)
                if (peerConnection) {
                    peerConnection.close()
                }
                this.PCs.delete(remoteSocketId)
            }
            console.log(`Receive channel state is: ${dataChannel?.readyState}`)
        }
    }

    private onIceCandidate(to: string) {
        return async (rtcIceCandidate: RTCPeerConnectionIceEvent) => {
            await this.sendMessageOverWebSocket({
                action: "message", message: {
                    candidate: rtcIceCandidate.candidate,
                    to
                }
            })
        }
    }

    private async offer(rtcPeerConnection: RTCPeerConnection, to: string) {
        if (rtcPeerConnection) {
            await rtcPeerConnection.createOffer()
                .then(
                    this.setOfferDescription(rtcPeerConnection, to)
                    , this.onCreateSessionDescriptionError()
                ).catch((reason: any) => {
                    console.log(reason)
                })
        }
    }

    public async answer(offer: RTCSessionDescription, to: string) {
        let rtcPeerConnection = this.PCs.get(to)

        if (rtcPeerConnection) {
            await rtcPeerConnection.setRemoteDescription(offer)
            await rtcPeerConnection.createAnswer()
                .then(
                    this.setAnswerDescription(to)
                    , this.onCreateSessionDescriptionError())
        }
    }

    public async addTracksToPCs() {
        this.PCs.forEach((value: RTCPeerConnection) => {
            this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
                value.addTrack(track)
            })
        })
    }

    private onCreateSessionDescriptionError() {
        return (error: Error) => {
            console.log('Failed to create session description: ' + error.toString())
        }
    }

    private setOfferDescription(rtcPeerConnection: RTCPeerConnection, remoteSocketId: string) {
        return async (desc: RTCSessionDescriptionInit) => {
            await this.sendMessageOverWebSocket({
                action: "message", message: {
                    offer: {
                        type: desc.type,
                        sdp: desc.sdp
                    },
                    to: remoteSocketId
                }
            })

            if (rtcPeerConnection) {
                await rtcPeerConnection.setLocalDescription(desc)
            }
        }
    }

    private setAnswerDescription(to: string) {
        return async (desc: RTCSessionDescriptionInit) => {
            await this.sendMessageOverWebSocket({
                action: "message", message: {
                    answer: {
                        type: desc.type,
                        sdp: desc.sdp
                    },
                    to
                }
            })
            let peerConnection = this.PCs.get(to)
            if (peerConnection) {
                await peerConnection.setLocalDescription(desc)
            }
        }
    }

    public async setOnDataChannel(sender: string) {
        let peerConnection: RTCPeerConnection = this.PCs.get(sender)

        if (peerConnection) {
            peerConnection.ondatachannel = this.onDataChannel(sender)
        }
    }

    public async setDescription(sdp: RTCSessionDescription, sender: string) {
        let peerConnection: RTCPeerConnection = this.PCs.get(sender)

        if (peerConnection) {
            const rtcSessionDescription = new RTCSessionDescription(sdp)
            await peerConnection.setRemoteDescription(rtcSessionDescription)
            peerConnection.ondatachannel = this.onDataChannel(sender)
        }
    }

    private onAddIceCandidateSuccess() {
        return () => {
            console.log('AddIceCandidate success.')
        }
    }

    private onAddIceCandidateError() {
        return (error: Error) => {
            console.log(`Failed to add Ice Candidate: ${error.toString()}`)
        }
    }

    public addIceCandidate(message: any) {
        setTimeout(async () => {
            let peerConnection = this.PCs.get(message.sender)
            if (peerConnection) {
                await peerConnection.addIceCandidate(message.candidate).then(
                    this.onAddIceCandidateSuccess(),
                    this.onAddIceCandidateError()
                )
            }
        }, 250)
    }


    async generatePCs(message: any) {
        this.token = message.token
        for (let peer of message.peers) {
            if (message.me && message.me.id !== peer) {
                await this.generatePC(peer)
            }
        }
    }
}
