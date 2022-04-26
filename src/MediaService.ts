export class MediaService {
  static localVideoStream: MediaStream;

  public static getMediator() {
    let navigator: any = window.navigator;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return navigator.mediaDevices;
    } else if (navigator && navigator.getUserMedia) {
      return navigator;
    } else {
      throw new Error('Something bad happened.');
    }
  }

  public static getMedia(constrains: Constraints): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      this.getMediator()
        .getUserMedia(constrains)
        .then((stream: MediaStream) => {
          resolve(stream);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  public static getDevices(): Promise<Array<InputDeviceInfo | MediaDeviceInfo>> {
    return new Promise((resolve) => {
      this.getMediator()
        .enumerateDevices()
        .then((devices: Array<InputDeviceInfo | MediaDeviceInfo>) => {
          resolve(devices);
        });
    });
  }
}
