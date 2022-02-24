import { Data } from "./model/Data";
export declare class SignalService {
    private socket?;
    private localStream;
    private PCs;
    private DCs;
    private RCs;
    private remoteMediaStreamTracksMap;
    private remoteMediaStreamMap;
    private token;
    private peerListener?;
    private onDisconnected?;
    private onMediaStream?;
    private connectionId;
    private apiUrl;
    /**
     * SignalService
     * @param room the room name to join
     * @param socketUrl the url for socket connection
     * @param peerListener the callback function to receive the data from peers
     */
    constructor();
    /**
     * Connect initializes socket object and connects
     * @param room the room name to join
     * @param socketUrl the url for socket connection
     * @param apiUrl rest api url
     * @private
     */
    connect(room: string, socketUrl: string, apiUrl: string): void;
    setPeerListener(peerListener: Function): void;
    setOnDisconnected(onDisconnected: Function): void;
    setLocalStream(localStream: MediaStream): void;
    setOnMediaStream(onMediaStream: Function): void;
    /**
     * sendMessageOverWebSocket
     * @param data
     */
    sendMessageOverWebSocket(data: Data): Promise<void>;
    /**
     * returns self socketId
     */
    getConnectionId(): string;
    /**
    * sendMessageOverWebRTC
    * @param msg string msg text
    */
    sendMessageOverWebRTC(data: any): void;
    toggleAudioEnabled(): void;
    toggleVideoEnabled(): void;
    generatePC(remoteSocketId: string): Promise<void>;
    answer(offer: RTCSessionDescription, to: string): Promise<void>;
    addTracksToPCs(): Promise<void>;
    removeTracksFromPCs(): Promise<void>;
    setDescription(sdp: RTCSessionDescription, sender: string): Promise<void>;
    addIceCandidate(message: any): void;
    setOnDataChannel(sender: string): Promise<void>;
    /**
     * It make us send joining request to room
     * @param room
     * @private
     */
    private onSocketOpen;
    /**
     * Process messages coming from WebSocket [socket.onmessage]
     * @private
     */
    private onMessage;
    private onClose;
    private onError;
    /**
     * sendBeacon will send the request even the tab closed
     * it will remove our connectionId from room object
     * @private
     */
    private beforeUnload;
    private onConnectionStateChange;
    private onTrack;
    private onEnded;
    private createDataChannel;
    private onNegotiationNeeded;
    private onDataChannel;
    private onReceiveMessageCallback;
    private onSendChannelStateChange;
    private onReceiveChannelStateChange;
    private onIceCandidate;
    private offer;
    private onCreateSessionDescriptionError;
    private setOfferDescription;
    private setAnswerDescription;
    private onAddIceCandidateSuccess;
    private onAddIceCandidateError;
    generatePCs(message: any): Promise<void>;
}
