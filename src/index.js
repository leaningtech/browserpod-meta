const version="1.0.0"
const dynImport = new Function("x", "return import(x)");
async function loadLibrary()
{
	try
	{
		return await dynImport(`https://rt.browserpod.io/${version}/browserpod.js`);
	}
	catch(e)
	{
		// Be robust to spurious SSR of this import
		return {BrowserPod: null}
	}
}
const Library = await loadLibrary();
export const BrowserPod = Library.BrowserPod;
