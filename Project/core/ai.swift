/// Send a prompt to Apple Intelligence and get text back.
import Foundation
import FoundationModels

let prompt = CommandLine.arguments.dropFirst().joined(separator: " ")
let defaultPrompt = "Generate Just a Random Project Name, do not give explanation, just give the name."
let message = prompt.isEmpty ? defaultPrompt : prompt

func chatWithAppleIntelligence(_ message: String) async throws -> String {
    // Hard cap at 4000 tokens — keeps the session within local model limits
    var options = GenerationOptions()
    options.maximumResponseTokens = 4000

    let session = LanguageModelSession()
    let response = try await session.respond(to: message, options: options)
    return response.content
}

Task {
    do {
        let reply = try await chatWithAppleIntelligence(message)
        print(reply)
        exit(0)
    } catch {
        fputs("\(error)\n", stderr)
        exit(1)
    }
}

dispatchMain()
