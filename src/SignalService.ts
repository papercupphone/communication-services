import RTCService from "./RTCService"
import {Data} from "./model/Data";

export class SignalService {

    private socket?: WebSocket
    private rtcService: RTCService
    public peerListener?: Function
    public connectionId: string = ""
    private apiUrl: string = ""

    /**
     * SignalService
     * @param room the room name to join
     * @param socketUrl the url for socket connection
     * @param peerListener the callback function to receive the data from peers
     */
    constructor() {
        this.rtcService = new RTCService(this)
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

    /**
     * sendMessageOverWebSocket
     * @param data
     */
    public async sendMessageOverWebSocket(data: Data) {
        this.socket?.send(JSON.stringify(data))
    }

    /**
     * sendMessageOverWebRTC
     * @param msg any msg object
     */
    public async sendMessageOverWebRTC(msg: any) {
        this.rtcService.sendMessageOverWebRTC(msg)
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
                await self.rtcService.generatePC(message.sender, false)
                await self.rtcService.setDescription(message.offer, message.sender)
                await self.rtcService.answer(message.offer, message.sender)
            }

            if (message && message.answer) {
                await self.rtcService.setDescription(message.answer, message.sender)
            }

            if (message && message.message) {
                console.log(event.data)
            }

            if (message && message.joined) {
                console.log("User joined room with id " + message.joined.id)
            }

            if (message && message.me) {
                self.connectionId = message.me.id
                await self.rtcService.generatePCs(message)
            }

            if (message && message.candidate) {
                self.rtcService.addIceCandidate(message)
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
            navigator.sendBeacon(self.apiUrl + "/leave", JSON.stringify({connectionId: self.connectionId}));
        }
    }
}
