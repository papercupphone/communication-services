interface Message {
    candidate?: RTCIceCandidate;
    offer?: Offer;
    answer?: Offer;
    to?: string;
}
