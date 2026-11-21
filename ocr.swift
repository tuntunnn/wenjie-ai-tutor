import Foundation
import Vision
let bytes = FileHandle.standardInput.readDataToEndOfFile()
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans","en-US"]
do {
 try VNImageRequestHandler(data: bytes).perform([request])
 print((request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n"))
} catch { exit(1) }
