export declare class MediaService {
    static localVideoStream: MediaStream;
    static getMediator(): any;
    static getMedia(constrains: Constraints): Promise<MediaStream>;
    static getDevices(): Promise<Array<InputDeviceInfo | MediaDeviceInfo>>;
}
