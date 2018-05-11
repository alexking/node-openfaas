const path = require('path')
const request = require('request-promise')

class OpenFaaS {

	/**
	 * Setup a new OpenFaas object
	 *
	 * @constructs
	 * @param {string} gateway - openfaas endpoint
	 * @param {object} requestOptions - any additional `request` library options
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
	 * Get a list of available functions and their data
	 *
	 * @returns {Promise<IncomingMessage>}
	 */
	list() {
		return this.request.get('/system/functions')
	}

	/**
	 * Invoke a function
	 *
	 * @param {string} func - name of the function to invoke
	 * @param {object} data - function input
	 * @param {object} options
	 * @param {boolean} options.isJson - whether we are sending and expect JSON
	 * @param {boolean} options.isBinaryResponse - whether we expect binary (instead of utf8)
	 * @param {string} options.callbackUrl - use async and post result back to this URL
	 * @param {object} options.headers - add headers to the request
	 * @returns {Promise<IncomingMessage>}
	 */
	invoke(func, data, {
		isJson = false,
		isBinaryResponse = false,
		callbackUrl = false,
		headers = {}
	} = {}) {
		// If there is a callback url, then call the async endpoint
		const action = callbackUrl ? 'async-function' : 'function'

		const endpoint = path.join(action, func)

		const options = {
			json: isJson,
			encoding: (isBinaryResponse ? null : 'utf8'),
			headers
		}

		if (data) {
			options.body = data
		}

		if (callbackUrl !== false) {
			options.headers['X-Callback-Url'] = callbackUrl
		}

		return this.request.post(endpoint, options)
	}

	/**
	 * List a single function and its data
	 *
	 * @param {string} func - function name
	 * @returns {Promise<IncomingMessage>}
	 */
	inspect(func) {
		const inspectEndpoint = path.join('/system/function/', func)

		return this.request.get(inspectEndpoint)
	}

	/**
	 * Deploy a function
	 *
	 * @param {string} func - name for the function
	 * @param {string} image - image to use
	 * @param {object} options
	 * @param {string} options.network - name of the network to use
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
	 * @param {string} name - function name
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
	 * @param {*} initial - input to send to the first function
	 * @param {array} funcs - list of functions to chain together
	 * @param {object} options - options to pass to each invoke
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
