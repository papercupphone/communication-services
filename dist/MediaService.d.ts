export declare class MediaService {
    static localVideoStream: MediaStream;
    static getMediator(): any;
    static getMedia(constrains: Constraints): Promise<unknown>;
    static getDevices(): Promise<unknown>;
}
