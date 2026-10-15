"""
GOD'S PANDORA <-> TouchDesigner Bridge Setup Script
================================================
Run this in TouchDesigner's Textport (Alt+T) or paste into a Script DAT and execute.
It builds the complete bridge network in one click.

How to use:
  1. Open TouchDesigner
  2. Press Alt+T (Textport)
  3. Paste this script and press Enter
  4. The bridge network appears in /project1/
  5. In God's Pandora, click "Connect" — you're live!
"""

import td

def buildBridge(parent=None):
    root = parent or op('/project1')

    # ── Create a base container for the bridge ──────────────────────────────────
    bridge = root.create(baseCOMP, 'godsEyeBridge')
    bridge.nodeX, bridge.nodeY = 0, 0
    bridge.par.externaltox = ''
    bridge.comment = "GOD'S PANDORA Bridge — do not delete"

    # ── OSC In CHOP (receives from God's Pandora on port 7000) ─────────────────────
    oscIn = bridge.create(oscInCHOP, 'oscIn')
    oscIn.nodeX, oscIn.nodeY = -400, 0
    oscIn.par.port = 7000
    oscIn.par.active = True
    oscIn.comment = "Receives OSC from God's Pandora"

    # ── OSC Out CHOP (sends back to God's Pandora on port 7001) ───────────────────
    oscOut = bridge.create(oscOutCHOP, 'oscOut')
    oscOut.nodeX, oscOut.nodeY = 400, 0
    oscOut.par.host = '127.0.0.1'
    oscOut.par.port = 7001
    oscOut.par.active = True
    oscOut.comment = "Sends OSC back to God's Pandora"

    # ── Web Server DAT (WebSocket on port 9980) ────────────────────────────────
    try:
        wsServer = bridge.create(webServerDAT, 'wsServer')
        wsServer.nodeX, wsServer.nodeY = 0, -200
        wsServer.par.port = 9980
        wsServer.par.active = True
        wsServer.comment = "WebSocket — bi-directional JSON with God's Pandora"
    except Exception as e:
        print('[Bridge] WebSocket DAT skipped:', e)

    # ── Null CHOP to expose all received params ────────────────────────────────
    nullOut = bridge.create(nullCHOP, 'params')
    nullOut.nodeX, nullOut.nodeY = 0, 0
    nullOut.inputConnectors[0].connect(oscIn)
    nullOut.comment = "All God's Pandora params — wire this to your network"

    # ── Movie File Out TOP for render capture ─────────────────────────────────
    try:
        fileOut = bridge.create(movieFileOutTOP, 'renderOut')
        fileOut.nodeX, fileOut.nodeY = 600, -300
        fileOut.par.file = 'C:/Users/Public/GodsPandora_Output/frame.png'
        fileOut.par.record = False
        fileOut.comment = "Set path to your output folder — God's Pandora watches this"
    except Exception as e:
        print('[Bridge] MovieFileOut skipped:', e)

    print('=' * 50)
    print("GOD'S PANDORA BRIDGE BUILT!")
    print('  OSC In  : port 7000 (God\'s Eye → TD)')
    print('  OSC Out : port 7001 (TD → God\'s Eye)')
    print('  WebSocket: port 9980')
    print('  Params CHOP: /project1/godsEyeBridge/params')
    print('')
    print("  Wire 'params' CHOP channels to your network.")
    print("  Click 'Connect' in God's Pandora to go live!")
    print('=' * 50)
    return bridge

buildBridge()
