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
            throw new Error('Something bad happened.');
        }
    }
    static getMedia(constrains) {
        return new Promise((resolve, reject) => {
            this.getMediator()
                .getUserMedia(constrains)
                .then((stream) => {
                resolve(stream);
            })
                .catch((err) => {
                reject(err);
            });
        });
    }
    static getDevices() {
        return new Promise((resolve) => {
            this.getMediator()
                .enumerateDevices()
                .then((devices) => {
                resolve(devices);
            });
        });
    }
}
