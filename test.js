const test = require('tape')
const nock = require('nock')
const OpenFaaS = require('./openfaas')

test('Test typeofs', t => {
	t.plan(8)

	t.equals(typeof OpenFaaS, 'function')

	const openfaas = new OpenFaaS('http://localhost:8080')

	t.equals(typeof openfaas, 'object')
	t.equals(typeof openfaas.deploy, 'function')
	t.equals(typeof openfaas.invoke, 'function')
	t.equals(typeof openfaas.compose, 'function')
	t.equals(typeof openfaas.remove, 'function')
	t.equals(typeof openfaas.inspect, 'function')
	t.equals(typeof openfaas.list, 'function')
})

test('Test management', async t => {
	// Mock the REST API
	nock('http://localhost:8080')

		// Deploy
		.post('/system/functions', {
			service: 'test-func',
			network: 'func_functions',
			image: 'hello-serverless'
		}).reply(200)

		// List
		.get('/system/functions').reply(200, [{
			name: 'func_echoit',
			image: 'functions/alpine:health@sha256:52e6e83add2caafc014d9f14984781c91d0d36c7d13829a7ccec480f2e395d19',
			invocationCount: 12,
			replicas: 1,
			envProcess: 'cat'
		}])

		// Compose
		.post('/function/func_nodeinfo').reply(200, 'hello cruel world')
		.post('/function/func_echoit', 'hello cruel world').reply(200, 'hello cruel world')
		.post('/function/func_wordcount', 'hello cruel world').reply(200, 3)

		// Compose with a failure
		.post('/function/func_nodeinfo').reply(200, 'hello cruel world')
		.post('/function/not_a_real_function_surprise', 'hello cruel world').reply(502, '')

		// Inspect
		.get('/system/function/func_echoit').reply(200, {
			name: 'func_echoit',
			image: 'functions/alpine:health@sha256:52e6e83add2caafc014d9f14984781c91d0d36c7d13829a7ccec480f2e395d19',
			invocationCount: 12,
			replicas: 1,
			envProcess: 'cat'
		})

		// Remove
		.delete('/system/functions', { functionName: 'test-func' }).reply(200)

	t.plan(9)

	const openfaas = new OpenFaaS('http://localhost:8080')

	try {
		// Test deploy
		await openfaas.deploy(
			'test-func',
			'hello-serverless'
		).then(x => t.equals(x.statusCode, 200))

		// Test listing functions
		await openfaas.list()
			.then(x => {
				t.equals(x.statusCode, 200)
				t.equals(x.body[0].name, 'func_echoit')
			})

		// Test composing function
		await openfaas.compose('', [
			'func_nodeinfo',
			'func_echoit',
			'func_wordcount'
		]).then(x => {
			t.equals(x.statusCode, 200)
			t.equals(x.body, '3')
		})

		// Test composing with a non-existant function
		await openfaas.compose('', [
			'func_nodeinfo',
			'not_a_real_function_surprise',
			'func_wordcount'
		]).catch(err => {
			t.equals(err.statusCode, 502)
		})

		// Test inspecting a function
		await openfaas.inspect('func_echoit')
			.then(x => {
				t.equals(x.statusCode, 200)
				t.equals(x.body.name, 'func_echoit')
			})

		// Test removing a function
		await openfaas.remove('test-func')
			.then(x => t.equals(x.statusCode, 200))
	} catch (err) {
		console.error(err)
	}
})

test('Test invoke', async t => {
	const callbackUrl = 'http://localhost'

	nock('http://localhost:8080')
		// Sync
		.post('/function/func_echoit', 'test')
		.reply(200, 'test')

		// Async
		.post('/async-function/func_echoit', 'test async')
		.matchHeader('x-callback-url', callbackUrl)
		.reply(202)

		// Custom header
		.post('/async-function/func_echoit', 'test custom')
		.matchHeader('x-custom-header', 'bespoke')
		.reply(202)

	t.plan(4)

	const openfaas = new OpenFaaS('http://localhost:8080')

	try {
		await openfaas.invoke('func_echoit', 'test').then(x => {
			t.equals(x.statusCode, 200)
			t.equals(x.body, 'test')
		})

		await openfaas.invoke('func_echoit', 'test async', {
			callbackUrl
		}).then(x => {
			t.equals(x.statusCode, 202)
		})

		await openfaas.invoke('func_echoit', 'test custom', {
			callbackUrl,
			headers: {
				'x-custom-header': 'bespoke'
			}
		}).then(x => {
			t.equals(x.statusCode, 202)
		})
	} catch (err) {
		console.error(err)
	}
})

test('Test basic auth', async t => {
	// Mock a gateway behind basic auth
	nock('http://localhost:8080')
		.post('/function/func_echoit', 'test')
		.basicAuth({
			user: 'jane',
			pass: '123'
		})
		.reply(200, 'test')

	t.plan(2)

	const openfaas = new OpenFaaS('http://localhost:8080', {
		auth: {
			user: 'jane',
			pass: '123'
		}
	})

	await openfaas.invoke('func_echoit', 'test').then(x => {
		t.equals(x.statusCode, 200)
		t.equals(x.body, 'test')
	}).catch(console.error)
})

