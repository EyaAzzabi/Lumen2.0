import copy
import unittest
import test_v2 as fixture
from plume import api


class ConstraintTests(unittest.TestCase):
    setUp = fixture.V2Tests.setUp
    tearDown = fixture.V2Tests.tearDown
    login = fixture.V2Tests.login
    post = fixture.V2Tests.post
    file = fixture.V2Tests.file

    def objection(self, plan, maximum=1, minimum=0):
        n = next(n for n in api.store.notices() if n['plan_id'] == plan['id'])
        self.login(n['to_operator_id'])
        rule = dict(asset_id=n['asset_ids'][0], reason='Protect our equipment',
                    max_damage_fraction=maximum, min_separation_m=minimum)
        r = self.client.patch('/api/notices/' + n['id'], json=dict(
            status='objection', reply='Please evaluate this limit', constraints=[rule]),
            headers={'Idempotency-Key': 'structured-' + n['id']})
        self.assertEqual(r.status_code, 200, r.text)
        return n, rule

    def test_objection_ownership_reason_and_consultation(self):
        p = self.file()
        n, rule = self.objection(p)
        for asset in ['k-pad', 'not-an-asset']:
            bad = dict(rule, asset_id=asset)
            r = self.client.patch('/api/notices/' + n['id'], json=dict(
                status='objection', reply='Concern', constraints=[bad]),
                headers={'Idempotency-Key': 'invalid-' + asset})
            self.assertEqual(r.status_code, 409, r.text)
        for body in [dict(status='objection', reply='  '), dict(
            status='objection', reply='Concern', constraints=[dict(rule, reason='  ')])]:
            self.assertEqual(self.client.patch('/api/notices/' + n['id'], json=body,
                headers={'Idempotency-Key':'empty'}).status_code, 422)
        self.login('kestrel')
        self.assertEqual(self.client.patch('/api/notices/' + n['id'], json=dict(
            status='objection', reply='Concern', constraints=[rule]),
            headers={'Idempotency-Key':'wrong-sender'}).status_code, 403)

    def test_real_constrained_optimization_adoption_revision_and_explicit_response(self):
        p = self.file()
        n, rule = self.objection(p, maximum=.03, minimum=1000)
        self.login('kestrel')
        inputs = dict(lander=self.body['lander'], site=self.body['site'], plan_id=p['id'], search_radius_m=4000)
        response = self.post('/api/optimize', inputs)
        self.assertEqual(response.status_code, 200, response.text)
        run = response.json()
        self.assertEqual(run['constraint_status'], 'feasible_evaluated_site')
        self.assertEqual(run['constraints'][0]['asset_id'], rule['asset_id'])
        self.assertTrue(run['best_explanation']['constraint_evaluation']['satisfied'])
        body = dict(self.body, expected_revision=1, optimization_run_id=run['run_id'],
                    site={k:run['best']['site'][k] for k in ('x','y')})
        bad = dict(body, site=self.body['site'])
        self.assertEqual(self.post('/api/plans/'+p['id']+'/revisions', bad).status_code, 422)
        bad = copy.deepcopy(body)
        bad['lander']['hover_s'] += 1
        self.assertEqual(self.post('/api/plans/'+p['id']+'/revisions', bad).status_code, 422)
        r = self.post('/api/plans/'+p['id']+'/revisions', body)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['plan']['status'], 'awaiting_responses')
        detail = self.client.get('/api/plans/'+p['id']).json()
        snapshot = detail['revisions'][1]['historical_assessment']
        self.assertEqual(snapshot['optimization']['id'], run['run_id'])
        self.assertTrue(snapshot['constraint_evaluation']['satisfied'])
        next_notice = next(v for v in api.store.notices() if v['plan_id']==p['id'] and v['revision']==2 and v['to_operator_id']==n['to_operator_id'])
        self.assertEqual(next_notice['constraints'], [rule])
        self.login(n['to_operator_id'])
        self.assertEqual(self.client.get('/api/optimization-runs/'+run['run_id']).status_code, 404)
        response = self.client.patch('/api/notices/'+next_notice['id'], json=dict(status='acknowledged'), headers={'Idempotency-Key':'explicit'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(api.store.responses(n['id'])[0]['constraints'], [rule])

    def test_no_feasible_search_and_filing_rechecks(self):
        p = self.file()
        self.objection(p, maximum=0, minimum=30000)
        self.login('kestrel')
        r = self.post('/api/optimize', dict(lander=self.body['lander'], site=self.body['site'], plan_id=p['id'], search_radius_m=500))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['constraint_status'], 'no_feasible_evaluated_site')
        self.assertIsNone(r.json()['best'])
        self.assertEqual(r.json()['alternatives'], [])
        r = self.post('/api/plans/'+p['id']+'/revisions', dict(self.body, expected_revision=1))
        self.assertEqual(r.status_code, 422, r.text)
        self.assertEqual(len(api.store.revisions(p['id'])), 1)

    def test_filing_rejects_registry_race(self):
        from unittest.mock import patch
        import json
        self.login('kestrel')
        real = api.planner.assess
        def changed(*args, **kwargs):
            result = real(*args, **kwargs)
            asset = api.store.assets()[0]
            asset['value_meur'] += 1
            with api.store.transaction() as c:
                c.execute('UPDATE assets SET payload=? WHERE id=?', (json.dumps(asset), asset['id']))
            return result
        with patch.object(api.planner, 'assess', side_effect=changed):
            response = self.post('/api/plans', self.body)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(api.store.plans(), [])

    def test_low_and_high_exposure_are_model_outputs(self):
        high = self.post('/api/assess', {k:self.body[k] for k in ('lander','site')})
        low = self.post('/api/assess', dict(lander=dict(label='Light preset',thrust_kn=4,hover_s=10,dispersion_m=20),site=dict(x=12000,y=12000)))
        self.assertEqual(high.status_code,200,high.text)
        self.assertEqual(low.status_code,200,low.text)
        self.assertGreater(high.json()['summary']['expected_loss_meur'],low.json()['summary']['expected_loss_meur'])
        self.assertEqual(low.json()['summary']['assets_at_risk'],0)


if __name__ == '__main__':
    unittest.main()

