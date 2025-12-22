import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        {/* SDK de OneSignal */}
        <script src="https://cdn.onesignal.com/sdks/OneSignalSDK.js" async=""></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.OneSignal = window.OneSignal || [];
              OneSignal.push(function() {
                OneSignal.init({
                  appId: "4d13c648-04bc-4aa1-b50a-bbd4b9350c3c",
                  notifyButton: { enable: true }
                });
                OneSignal.showNativePrompt();
              });
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
