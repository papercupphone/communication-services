export class MediaService {
    static localVideoStream: MediaStream

    public static getMediator(){
        let navigator: any = window.navigator

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            return  navigator.mediaDevices
        } else if (navigator && navigator.getUserMedia) {
            return  navigator
        } else {
            throw new Error("Something bad happened.")
        }
    }

    public static getMedia(constrains: Constraints) {
        return new Promise((resolve, reject) => {
            this.getMediator().getUserMedia(constrains).then(function (stream) {
                resolve(stream)
            }).catch(function (err) {
                reject(err)
            })
        })
    }

    public static getDevices(constrains: Constraints) {
        return new Promise((resolve, reject) => {
            this.getMediator().enumerateDevices().then(function (devices) {
                resolve(devices)
            })
        })
    }
}
