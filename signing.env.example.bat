@echo off
:: Copy this file to signing.env.bat (same folder) and fill in ONE option. signing.env.bat is git-ignored.

:: Option A - certificate installed on this PC (Certum SimplySign, USB token, any OV/EV cert)
:: set WIN_CERT_SUBJECT=Haider Bhatti

:: Option B - .pfx file
:: set WIN_CERT_PFX=C:\certs\godseye.pfx
:: set WIN_CERT_PASSWORD=your-password

:: Option C - Azure Artifact Signing
:: set AZURE_SIGN_DLIB=C:\tools\Microsoft.Trusted.Signing.Client\bin\x64\Azure.CodeSigning.Dlib.dll
:: set AZURE_SIGN_METADATA=C:\certs\metadata.json
