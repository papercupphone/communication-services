export class MediaService {
    static getMediator() {
        let navigator = window.navigator;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            return navigator.mediaDevices;
        }
        else if (navigator && navigator.getUserMedia) {
            return navigator;
        }
        else {
            throw new Error("Something bad happened.");
        }
    }
    static getMedia(constrains) {
        return new Promise((resolve, reject) => {
            this.getMediator().getUserMedia(constrains).then(function (stream) {
                resolve(stream);
            }).catch(function (err) {
                reject(err);
            });
        });
    }
    static getDevices(constrains) {
        return new Promise((resolve, reject) => {
            this.getMediator().enumerateDevices().then(function (devices) {
                resolve(devices);
            });
        });
    }
}
