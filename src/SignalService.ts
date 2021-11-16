import {Data} from "./model/Data"

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
        let self = this
        return async () => {
            if (self.socket) {
                self.socket.onmessage = self.onMessage()
            }
            await self.sendMessageOverWebSocket({action: "join", room: {name: room}})
        }
    }

    /**
     * Process messages coming from WebSocket [socket.onmessage]
     * @private
     */
    private onMessage() {
        let self = this
        return async (event: any) => {
            let message: any

            try {
                message = JSON.parse(event.data)
            } catch (e) {
                console.log(e)
            }

            if (message && message.offer) {
                await self.generatePC(message.sender, false)
                await self.setDescription(message.offer, message.sender)
                await self.answer(message.offer, message.sender)
            }

            if (message && message.answer) {
                await self.setDescription(message.answer, message.sender)
            }

            if (message && message.message) {
                console.log(event.data)
            }

            if (message && message.joined) {
                console.log("User joined room with id " + message.joined.id)
            }

            if (message && message.me) {
                self.connectionId = message.me.id
                await self.generatePCs(message)
            }

            if (message && message.candidate) {
                self.addIceCandidate(message)
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
        let self = this
        return async () => {
            navigator.sendBeacon(self.apiUrl + "/leave", JSON.stringify({connectionId: self.connectionId}))
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

    public async generatePC(remoteSocketId: string, isInitiator: boolean) {
        const configuration = {'iceServers': this.token.iceServers}
        let RTCPeerConnection = window.RTCPeerConnection
        let rtcPeerConnection = new RTCPeerConnection(configuration)

        this.PCs.set(remoteSocketId, rtcPeerConnection)
        rtcPeerConnection.onicecandidate = this.onIceCandidate(remoteSocketId)
        rtcPeerConnection.ontrack = this.onTrack(remoteSocketId)

        this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
            rtcPeerConnection.addTrack(track)
        })

        this.createDataChannel(rtcPeerConnection, remoteSocketId)

        if (isInitiator) {
            await this.offer(remoteSocketId)
        }
    }

    private onTrack(remoteSocketId: string) {
        let self = this
        return async (e: RTCTrackEvent) => {
            let remoteMediaStreamTracks = self.remoteMediaStreamTracksMap.get(remoteSocketId)
            if (remoteMediaStreamTracks && remoteMediaStreamTracks.length > 0) {
                remoteMediaStreamTracks.push(e.track)
                self.remoteMediaStreamTracksMap.set(remoteSocketId, remoteMediaStreamTracks)
            } else {
                self.remoteMediaStreamTracksMap.set(remoteSocketId, [e.track])
            }

            if (remoteMediaStreamTracks && remoteMediaStreamTracks.length >= 2) {
                let mediaStream = new MediaStream()
                for (let mediaStreamTrack of remoteMediaStreamTracks) {
                    mediaStream.addTrack(mediaStreamTrack)
                }
                self.remoteMediaStreamMap.set(remoteSocketId, mediaStream)
                if (self.onMediaStream) {
                    self.onMediaStream(self.remoteMediaStreamMap.get(remoteSocketId))
                }
            }
        }
    }

    private createDataChannel(rtcPeerConnection: RTCPeerConnection, remoteSocketId: string) {
        let dataChannel = rtcPeerConnection.createDataChannel('textMessageChannel')
        dataChannel.onopen = this.onSendChannelStateChange(remoteSocketId)
        dataChannel.onclose = this.onSendChannelStateChange(remoteSocketId)
        this.DCs.set(remoteSocketId, dataChannel)
    }

    private onDataChannel(sender: string) {
        let self = this
        return async (event: RTCDataChannelEvent) => {
            console.log('Receive Channel Callback')
            self.RCs.set(sender, event.channel)
            let channel = self.RCs.get(sender)
            if (channel) {
                channel.onmessage = self.onReceiveMessageCallback(sender)
                channel.onopen = self.onReceiveChannelStateChange(sender)
                channel.onclose = self.onReceiveChannelStateChange(sender)
            }
        }
    }

    private onReceiveMessageCallback(socketId: string) {
        let self = this
        return (event: MessageEvent) => {
            let data = event.data
            if (self.peerListener) {
                self.peerListener({data, socketId})
            }
        }
    }

    private onSendChannelStateChange(remoteSocketId: string) {
        let self = this
        return () => {
            let dataChannel = self.DCs.get(remoteSocketId)
            if (dataChannel) {
                const readyState = dataChannel.readyState
                console.log('Send channel state is: ' + readyState)
            }
        }
    }

    private onReceiveChannelStateChange(remoteSocketId: string) {
        let self = this
        return () => {
            let peerConnection = self.PCs.get(remoteSocketId)
            let dataChannel = self.DCs.get(remoteSocketId)
            let remoteDataChannel = self.RCs.get(remoteSocketId)
            if (dataChannel && dataChannel.readyState === 'closed') {
                if (dataChannel) {
                    dataChannel.close()
                }
                self.DCs.delete(remoteSocketId)
                if (remoteDataChannel) {
                    remoteDataChannel.close()
                }
                self.RCs.delete(remoteSocketId)
                if (peerConnection) {
                    peerConnection.close()
                }
                self.PCs.delete(remoteSocketId)
            }
            console.log(`Receive channel state is: ${dataChannel?.readyState}`)
        }
    }

    private onIceCandidate(to: string) {
        let self = this
        return async (rtcIceCandidate: RTCPeerConnectionIceEvent) => {
            await self.sendMessageOverWebSocket({
                action: "message", message: {
                    candidate: rtcIceCandidate.candidate,
                    to
                }
            })
        }
    }

    private async offer(to: string) {
        let rtcPeerConnection = this.PCs.get(to)
        if (rtcPeerConnection) {
            await rtcPeerConnection.createOffer()
                .then(
                    this.setOfferDescription(to)
                    , this.onCreateSessionDescriptionError()
                )
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

    private onCreateSessionDescriptionError() {
        return (error: Error) => {
            console.log('Failed to create session description: ' + error.toString())
        }
    }

    private setOfferDescription(to: string) {
        let self = this
        return async (desc: RTCSessionDescriptionInit) => {
            await self.sendMessageOverWebSocket({
                action: "message", message: {
                    offer: {
                        type: desc.type,
                        sdp: desc.sdp
                    },
                    to
                }
            })

            let peerConnection = self.PCs.get(to)
            if (peerConnection) {
                await peerConnection.setLocalDescription(desc)
            }
        }
    }

    private setAnswerDescription(to: string) {
        let self = this
        return async (desc: RTCSessionDescriptionInit) => {
            await self.sendMessageOverWebSocket({
                action: "message", message: {
                    answer: {
                        type: desc.type,
                        sdp: desc.sdp
                    },
                    to
                }
            })
            let peerConnection = self.PCs.get(to)
            if (peerConnection) {
                await peerConnection.setLocalDescription(desc)
            }
        }
    }

    public async setDescription(sdp: RTCSessionDescription, sender: string) {
        let peerConnection = this.PCs.get(sender)
        if (peerConnection && !peerConnection.currentRemoteDescription) {
            console.log('Set remote description')
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
        let self = this
        setTimeout(async () => {
            let peerConnection = self.PCs.get(message.sender)
            if (peerConnection) {
                await peerConnection.addIceCandidate(message.candidate).then(
                    self.onAddIceCandidateSuccess(),
                    self.onAddIceCandidateError()
                )
            }
        }, 250)
    }


    async generatePCs(message: any) {
        this.token = message.token
        for (let peer of message.peers) {
            if (message.me && message.me.id !== peer) {
                await this.generatePC(peer, true)
            }
        }
    }
}
