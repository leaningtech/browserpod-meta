const version="0.9.5"
const dynImport = new Function("x", "return import(x)");
async function loadLbrary()
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
const Library = await loadLbrary();
export const BrowserPod = Library.BrowserPod;
