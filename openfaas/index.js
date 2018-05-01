const path = require('path')
const request = require('request-promise')

class OpenFaaS {

	/**
	 * Setup a new OpenFaas object
	 *
	 * @constructs
	 * @param {string} gateway			openfaas endpoint
	 * @param {object} requestOptions 	any additional `request` library options
	 */
	constructor(gateway, requestOptions = {}) {
		// Default request options
		const defaultOptions = {
			baseUrl: gateway,
			resolveWithFullResponse: true,
			json: true
		}

		// Allow overriding
		const options = Object.assign(defaultOptions, requestOptions)

		// Set default options for all requests
		this.request = request.defaults(options)
	}

	/**
	 * Get a list of available functions and their info
	 *
	 * @returns {Promise<IncomingMessage>}
	 */
	list() {
		return this.request.get('/system/functions')
	}

	/**
	 * Invoke a function
	 *
	 * @returns {Promise<IncomingMessage>}
	 */
	invoke(func, data, { isJson = false, isBinaryResponse = false } = {}) {
		const functionEndpoint = path.join('/function', func)

		const options = {
			json: isJson,
			encoding: (isBinaryResponse ? null : 'utf8')
		}

		if (data) {
			options.body = data
		}

		return this.request.post(functionEndpoint, options)
	}

	/**
	 * List a single function and its info
	 *
	 * @param   {string}  func  function name
	 * @returns {Promise<object>}
	 */
	inspect(func) {
		const inspectEndpoint = path.join('/system/function/', func)

		return this.request.get(inspectEndpoint)
	}

	/**
	 * Deploy a function
	 *
	 * @param {string} func 			name for the function
	 * @param {string} image 			image to use
	 * @param {object} options
	 * @param {string} options.network  name of the network to use
	 * @returns {Promise<IncomingMessage>}
	 */
	deploy(func, image, { network = 'func_functions' } = {}) {
		const options = {
			body: {
				service: func,
				image,
				network
			}
		}

		return this.request.post('/system/functions', options)
	}

	/**
	 * Remove a function
	 *
	 * @param {string}  name  function name
	 * @returns {Promise<IncomingMessage>}
	 */
	remove(name) {
		const options = {
			body: {
				functionName: name
			}
		}

		return this.request.delete('/system/functions', options)
	}

	/**
	 * Allows you to chain functions together, passing the result from each
	 * as the input for the next (this takes place on the client side)
	 *
	 * @see https://github.com/openfaas/faas/blob/master/guide/chaining_functions.md
	 * @param {*}      initial  input to send to the first function
	 * @param {array}  funcs    list of functions to chain together
	 * @param {object} options  options to pass to each invoke
	 * @returns {Promise<IncomingMessage>}
	 */
	compose(initial, funcs, options = {}) {
		// Start with a promise that returns our initial value as a response
		let promise = Promise.resolve({ body: initial })

		// Add on a .then() call for each of the functions to build the promise chain
		for (const functionName of funcs) {
			promise = promise.then(response => {
				// Invoke the function using the response body as the input
				return this.invoke(functionName, response.body, options)
			})
		}

		return promise
	}
}

module.exports = OpenFaaS
