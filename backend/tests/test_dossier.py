import unittest, json
import test_v2 as fixture
from plume import api
from pathlib import Path

class DossierTests(unittest.TestCase):
    setUp=fixture.V2Tests.setUp
    tearDown=fixture.V2Tests.tearDown
    login=fixture.V2Tests.login
    post=fixture.V2Tests.post
    file=fixture.V2Tests.file

    def test_snapshot_survives_registry_change_and_authorization(self):
        p=self.file()
        url='/api/plans/'+p['id']+'/revisions/1/dossier'
        original=self.client.get(url).json()
        self.assertEqual(original['title'], 'PLUME Coordination Decision Dossier')
        self.assertEqual(original['frozen_revision']['snapshot']['inputs']['site'], self.body['site'])
        asset=api.store.assets()[0]
        with api.store.transaction() as c:
            asset['value_meur'] += 100
            c.execute('UPDATE assets SET payload=? WHERE id=?', (json.dumps(asset),asset['id']))
        self.assertEqual(original['frozen_revision'],self.client.get(url).json()['frozen_revision'])
        response=self.client.get(url+'?format=pdf')
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.content.startswith(b'%PDF'))
        Path('../tmp/pdfs').mkdir(parents=True,exist_ok=True)
        Path('../tmp/pdfs/decision-sample.pdf').write_bytes(response.content)
        self.assertEqual(self.client.get(url.replace('/1/','/99/')).status_code,404)
        notices=[n for n in api.store.notices() if n['plan_id']==p['id']]
        self.login(notices[0]['to_operator_id'])
        self.assertEqual(self.client.get(url).status_code,200)
        outside=next(o['id'] for o in api.store.operators() if o['id'] not in [p['operator_id'],*[n['to_operator_id'] for n in notices]])
        self.login(outside)
        self.assertEqual(self.client.get(url).status_code,403)

if __name__=='__main__':unittest.main()
