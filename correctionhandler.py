import correctioninfo

'''
Used for returning corrected information for song and artist combinations
that have been defined as misidentifications.
'''
class CorrectionHandler:    
    correctionMap = correctioninfo.correctionMap;

    '''
    init
    '''
    def __init__(self):
        pass
    
    '''
    Returns the corrected song information for the given song
    and artist combination. Returns None if that combination
    does not have a correction defined for it.
    '''
    def getCorrection(self, songAndArtist):
        return self.correctionMap.get(songAndArtist, None)
    
    '''
    Checks if a song and artist combination has corrected
    song information defined for it.
    '''
    def songAndArtistExists(self, songAndArtist):
        return None != self.getCorrection(songAndArtist)