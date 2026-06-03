import Foundation
import FoundationModels

let prompt = CommandLine.arguments.dropFirst().joined(separator: " ")
let defaultPrompt = "Generate Just a Random Project Name, do not give explanation, just give the name."
let message = prompt.isEmpty ? defaultPrompt : prompt

/// Send a prompt to Apple Intelligence and get text back.
@available(macOS 26.0, iOS 26.0, *)
func chatWithAppleIntelligence(_ message: String) async throws -> String {
    // Creates a conversation with Apple Intelligence
    let session = LanguageModelSession()

    // Send prompt + wait for reply
    let response = try await session.respond(to: message)

    // Return plain text
    return response.content
}

Task {
    do {
        let reply = try await chatWithAppleIntelligence(message)

        print(reply)
        exit(0)
    } catch {
        print("Error:", error)
        exit(1)
    }
}

dispatchMain()