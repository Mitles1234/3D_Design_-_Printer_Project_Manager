async function callPython() {
	const result = await window.pywebview.api.say_hello("Miles")
	document.getElementById("result").textContent = result
}

document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("hello-button")

	button.addEventListener("click", () => {
		callPython().catch((error) => {
			document.getElementById("result").textContent = error.message
		})
	})
})
