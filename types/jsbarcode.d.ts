declare module 'jsbarcode' {
  interface Options {
    format?: string
    displayValue?: boolean
    fontSize?: number
    height?: number
    margin?: number
    [key: string]: any
  }
  function JsBarcode(element: SVGSVGElement | string, text: string, options?: Options): void
  export default JsBarcode
}
