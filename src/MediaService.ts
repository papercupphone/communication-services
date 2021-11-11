export class MediaService {
   public static async getMedia(kind: string, constrains: Constraints) {
        let navigator: any = window.navigator
        let mediator

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            mediator = navigator.mediaDevices
        } else if (navigator && navigator.getUserMedia) {
            mediator = navigator
        } else {
            throw new Error("Something bad happened.")
        }

        mediator.getUserMedia(constrains).then(function (stream) {
            for (let track of stream.getTracks()) {
                if (track.kind === 'video') {
                    return stream
                }
            }
        }).catch(function (err) {
            console.log(err);
        })
    }
}
