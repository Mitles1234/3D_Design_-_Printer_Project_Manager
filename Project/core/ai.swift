/// Send a prompt to Apple Intelligence and get text back.
import Foundation // Loads the Foundation framework for basic functionality with Apple Systems
import FoundationModels // Loads the FoundationModels framework for using Apple Intelligence

// --- Variables ---
let prompt = CommandLine.arguments.dropFirst().joined(separator: " ") // Gets the prompt from the command line arguments
let defaultPrompt = "Generate Just a Random Project Name, do not give explanation, just give the name." // Default prompt if no prompt is given
let message = prompt.isEmpty ? defaultPrompt : prompt // Sets the message to the prompt or the default prompt if no prompt is given

// --- Apple Intelligencening ---
func chatWithAppleIntelligence(_ message: String) async throws -> String {
    /**
    Sends the prompt to Apple Intelligencem with a limit of 4000 tokens to force the prompt onto the local 
    model. It then loads it onto the model and returns the response.
    */
    var options = GenerationOptions() // Loads the Options for editing the parameters of the Model
    options.maximumResponseTokens = 4000 // Sets the maximum number of tokens to 4000 to force the prompt onto the local model

    let session = LanguageModelSession() // Creates a new session for the model
    let response = try await session.respond(to: message, options: options) // Sends the prompt to the model and gets the response
    return response.content // Returns the response
}

// --- Runs Apple Intelligence on the Start ---
Task {
    do {
        let reply = try await chatWithAppleIntelligence(message) // Sends the prompt to Apple Intelligence and waits for the response
        print(reply) // Prints the response
        exit(0) // Exits with error code 0 to say the AI worked
    } catch {
        fputs("\(error)\n", stderr) // Prints the error to standard error
        exit(1) // Exits with error code 1 to say the AI failed
    }
}

dispatchMain() // Keeps the program running until the task is complete