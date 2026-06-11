/// Send a prompt to Apple Intelligence and get text back.
@available(macOS 26.0, iOS 26.0, *)
import Foundation
import FoundationModels

let prompt = CommandLine.arguments.dropFirst().joined(separator: " ")
let defaultPrompt = "Generate Just a Random Project Name, do not give explanation, just give the name."
let message = prompt.isEmpty ? defaultPrompt : prompt

func chatWithAppleIntelligence(_ message: String) async throws -> String {
    let session = LanguageModelSession()
    
    // Start the real-time text stream
    let responseStream = try await session.streamResponse(to: message)
    
    // Create a mutable string to collect the incoming text chunks
    var accumulatedResponse = ""
    
    // Iterate through the text pieces as they generate
    for try await partialResponse in responseStream {
        // Append the new chunk to our collector string
        accumulatedResponse += partialResponse
        
        // Calculate the live token count of the entire conversation session
        let currentTokenCount = try await SystemLanguageModel.default.tokenCount(for: session.transcript)
        
        // Active Interception: Kill the process immediately if it bursts past the Local Cap - Ensuring Privacy
        if currentTokenCount > 4000 {
            throw "Generation exceeded the 4000 token safety limit."
        }
    }
    
    // Return the final plain text string, matching your original code behavior
    return accumulatedResponse
}

Task {
    do {
        let reply = try await chatWithAppleIntelligence(message)

        print(reply)
        exit(0)
    } catch {
        print(error)
        exit(1)
    }
}

dispatchMain()