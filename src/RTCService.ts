import {SignalService} from "./SignalService"

export default class {

    public PCs: Map<string, RTCPeerConnection> = new Map()
    private DCs: Map<string, RTCDataChannel> = new Map()
    private RCs: Map<string, RTCDataChannel> = new Map()
    public token: any
    private signalService?: SignalService

    constructor(signalService: SignalService) {
        this.signalService = signalService
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
        let dataChannel = rtcPeerConnection.createDataChannel('textMessageChannel')
        dataChannel.onopen = this.onSendChannelStateChange(remoteSocketId)
        dataChannel.onclose = this.onSendChannelStateChange(remoteSocketId)
        this.DCs.set(remoteSocketId, dataChannel)
        rtcPeerConnection.onicecandidate = this.onIceCandidate(remoteSocketId)
        if (isInitiator) {
            await this.offer(remoteSocketId)
        }
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
            let signalService = self.signalService
            if (signalService?.peerListener) {
                signalService.peerListener({data, socketId})
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
            await self.signalService?.sendMessageOverWebSocket({
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
            await self.signalService?.sendMessageOverWebSocket({
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
            await self.signalService?.sendMessageOverWebSocket({
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
