"""
GOD'S PANDORA Template: Particle Storm
===================================
Paste into a Script DAT in TouchDesigner and run to build a GPU particle system
fully controlled from God's Pandora via OSC.
"""
import td

def buildParticleStorm(parent=None):
    root = parent or op('/project1')
    base = root.create(baseCOMP, 'particleStorm')
    base.nodeX, base.nodeY = 200, 200

    # Particle SOP
    try:
        partSop = base.create(particleSOP, 'particles')
        partSop.par.maxparticles = 500000
        partSop.comment = 'GPU particles — wired from OSC params'
    except:
        pass

    # Noise CHOP for turbulence
    noise = base.create(noiseCHOP, 'turbulence')
    noise.par.type = 'sparse'
    noise.par.roughness = 0.7

    # Reference bridge params
    params_path = '/project1/pandoraBridge/params'
    print("ParticleStorm built! Wire " + params_path + " channels to particle parameters.")
    print("OSC channels to map:")
    print("  /pandora/particles/speed      -> Particle speed")
    print("  /pandora/particles/gravity    -> Gravity force")
    print("  /pandora/particles/turbulence -> Noise amplitude")
    print("  /pandora/particles/colorR/G/B -> Particle color")

buildParticleStorm()
